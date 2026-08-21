import type {
  ApprovalId,
  CorrelationId,
  CausationId,
  DecisionId,
  ExecutionMode,
  ProbabilityProposal,
  ProposalId,
  RiskApproval,
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

const authorizedExecutionBrand = Symbol('AuthorizedExecution');

export class AuthorizedExecution {
  private readonly [authorizedExecutionBrand] = true;

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

  static fromApproval(approval: RiskApproval, request: ExecutionRequest): AuthorizedExecution {
    if (!(approval instanceof RiskApproval)) {
      throw new Error('Decision boundary requires a real RiskApproval instance.');
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
    if (approval.mode !== request.mode) {
      throw new Error('Execution mode mismatch.');
    }
    if (approval.issuer !== 'RiskGuardian') {
      throw new Error('Only RiskGuardian can authorize execution.');
    }
    if (approval.decision !== 'APPROVED') {
      throw new Error('RiskGuardian must approve before execution.');
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
    if (new Date(approval.validUntil).getTime() <= Date.now()) {
      throw new Error('Authorization expired.');
    }
    if (new Date(request.expiration).getTime() <= Date.now()) {
      throw new Error('Execution authorization expired.');
    }
    if (request.provenance !== 'RiskGuardian') {
      throw new Error('Execution provenance is not RiskGuardian.');
    }
    if (approval.version !== request.version) {
      throw new Error('Authorization version mismatch.');
    }

    return new AuthorizedExecution(
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
    if (proposal.proposalId !== request.proposalId) {
      throw new Error('Proposal ID mismatch between proposal and execution request.');
    }
    if (proposal.instrument !== request.instrument) {
      throw new Error('Instrument mismatch between proposal and execution request.');
    }
    if (proposal.mode !== request.mode) {
      throw new Error('Execution mode mismatch between proposal and execution request.');
    }
    if (proposal.mode !== 'SIMULATION') {
      throw new Error('Live trading is disabled. Simulation mode is required.');
    }
    if (this.mode !== 'SIMULATION') {
      throw new Error('Decision boundary is simulation-first.');
    }

    return AuthorizedExecution.fromApproval(approval, {
      ...request,
      provenance: 'RiskGuardian',
    });
  }
}
