import {
  RiskApproval,
  type ApprovalId,
  type CorrelationId,
  type CausationId,
  type DecisionId,
  type ExecutionMode,
  type ProbabilityProposal,
  type ProposalId,
} from './risk-guardian';

export interface ExecutionRequest {
  proposalId: ProposalId;
  approvalId: ApprovalId;
  decisionId: DecisionId;
  instrument: string;
  mode: ExecutionMode;
  expiration: string;
  correlationId: CorrelationId;
  causationId: CausationId;
  provenance: 'RiskGuardian';
  version: string;
}

const decisionBoundaryAuthority = Symbol('DecisionBoundaryAuthority');
const validAuthorizations = new WeakSet<object>();

export class AuthorizedExecution {
  private constructor(
    public readonly proposalId: ProposalId,
    public readonly approvalId: ApprovalId,
    public readonly decisionId: DecisionId,
    public readonly instrument: string,
    public readonly mode: ExecutionMode,
    public readonly correlationId: CorrelationId,
    public readonly causationId: CausationId,
    public readonly expiration: string,
    public readonly version: string,
    public readonly provenance: 'RiskGuardian',
  ) {}

  /**
   * Capability-gated factory. Only DecisionBoundary owns the authority token.
   */
  static fromApproval(
    approval: RiskApproval,
    request: ExecutionRequest,
    authority: symbol,
  ): AuthorizedExecution {
    if (authority !== decisionBoundaryAuthority) {
      throw new Error('Only DecisionBoundary may issue an AuthorizedExecution token.');
    }
    if (!RiskApproval.isValid(approval)) {
      throw new Error('Decision boundary requires a valid RiskApproval instance.');
    }
    if (approval.approvalId !== request.approvalId) {
      throw new Error('Approval ID mismatch.');
    }
    if (approval.decisionId !== request.decisionId) {
      throw new Error('Decision ID mismatch.');
    }
    if (approval.proposalId !== request.proposalId) {
      throw new Error('Proposal ID mismatch.');
    }
    if (approval.instrument !== request.instrument) {
      throw new Error('Instrument mismatch.');
    }
    if (approval.mode !== request.mode || request.mode !== 'SIMULATION') {
      throw new Error('Execution mode mismatch; simulation mode is required.');
    }
    if (approval.issuer !== 'RiskGuardian') {
      throw new Error('Only RiskGuardian can authorize execution.');
    }
    if (approval.decision !== 'APPROVED') {
      throw new Error('RiskGuardian must approve before execution.');
    }
    if (approval.killSwitchActive) {
      throw new Error('Risk approval is blocked by the kill switch.');
    }
    if (!approval.correlationId || !approval.causationId) {
      throw new Error('Missing correlationId or causationId on authorization.');
    }
    if (approval.correlationId !== request.correlationId) {
      throw new Error('Correlation ID mismatch.');
    }
    if (approval.causationId !== request.causationId) {
      throw new Error('Causation ID mismatch.');
    }

    const approvalExpiry = Date.parse(approval.validUntil);
    const requestExpiry = Date.parse(request.expiration);
    if (!Number.isFinite(approvalExpiry) || approvalExpiry <= Date.now()) {
      throw new Error('Authorization expired or has an invalid expiry timestamp.');
    }
    if (!Number.isFinite(requestExpiry) || requestExpiry <= Date.now()) {
      throw new Error('Execution authorization expired or has an invalid expiry timestamp.');
    }
    if (request.provenance !== 'RiskGuardian') {
      throw new Error('Execution provenance is not RiskGuardian.');
    }
    if (approval.version !== request.version) {
      throw new Error('Authorization version mismatch.');
    }

    const authorization = new AuthorizedExecution(
      request.proposalId,
      request.approvalId,
      request.decisionId,
      request.instrument,
      request.mode,
      request.correlationId,
      request.causationId,
      request.expiration,
      request.version,
      'RiskGuardian',
    );

    Object.freeze(authorization);
    validAuthorizations.add(authorization);
    return authorization;
  }

  static isValid(value: unknown): value is AuthorizedExecution {
    return typeof value === 'object' && value !== null && validAuthorizations.has(value);
  }
}

export class DecisionBoundary {
  constructor(
    private readonly mode: ExecutionMode = 'SIMULATION',
    private readonly killSwitchActive = false,
  ) {}

  authorize(
    approval: RiskApproval,
    proposal: ProbabilityProposal,
    request: Omit<ExecutionRequest, 'provenance' | 'version'> & { version: string; provenance?: 'RiskGuardian' },
  ): AuthorizedExecution {
    if (this.killSwitchActive) {
      throw new Error('Decision boundary blocked by kill switch.');
    }
    if (!RiskApproval.isValid(approval)) {
      throw new Error('Decision boundary rejected an invalid or forged RiskApproval.');
    }
    if (approval.killSwitchActive) {
      throw new Error('Decision boundary blocked by the approval kill-switch flag.');
    }
    if (proposal.proposalId !== request.proposalId) {
      throw new Error('Proposal ID mismatch between proposal and execution request.');
    }
    if (proposal.instrument !== request.instrument) {
      throw new Error('Instrument mismatch between proposal and execution request.');
    }
    if (proposal.mode !== request.mode) {
      throw new Error('Execution mode mismatch between proposal and execution request.');
    }
    if (proposal.mode !== 'SIMULATION' || this.mode !== 'SIMULATION') {
      throw new Error('Live trading is disabled. Simulation mode is required.');
    }
    if (proposal.version !== request.version) {
      throw new Error('Proposal version mismatch.');
    }
    if (request.provenance !== undefined && request.provenance !== 'RiskGuardian') {
      throw new Error('Execution provenance must be RiskGuardian.');
    }

    return AuthorizedExecution.fromApproval(
      approval,
      {
        ...request,
        provenance: 'RiskGuardian',
      },
      decisionBoundaryAuthority,
    );
  }
}
