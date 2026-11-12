export type DecisionStatus = 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type ExecutionMode = 'SIMULATION' | 'LIVE';
export type RiskIssuer = 'RiskGuardian';

export type ProposalId = string & { readonly __proposalId: unique symbol };
export type DecisionId = string & { readonly __decisionId: unique symbol };
export type ApprovalId = string & { readonly __approvalId: unique symbol };
export type CorrelationId = string & { readonly __correlationId: unique symbol };
export type CausationId = string & { readonly __causationId: unique symbol };

export interface ProbabilityProposal {
  proposalId: ProposalId;
  instrument: string;
  mode: ExecutionMode;
  version: string;
  timestamp: string;
  correlationId: CorrelationId;
  causationId: CausationId;
  strategyId: string;
}

export interface RiskLimitSnapshot {
  riskPerTrade: number;
  dailyLossLimit: number;
  maxExposure: number;
  maxConcurrentTrades: number;
}

export interface RiskApprovalRecord {
  approvalId: ApprovalId;
  decisionId: DecisionId;
  proposalId: ProposalId;
  instrument: string;
  decision: DecisionStatus;
  reason: string;
  mode: ExecutionMode;
  issuer: RiskIssuer;
  validUntil: string;
  correlationId: CorrelationId;
  causationId: CausationId;
  riskLimits: RiskLimitSnapshot;
  killSwitchActive: boolean;
  timestamp: string;
  version: string;
}

const riskGuardianAuthority = Symbol('RiskGuardianAuthority');
const validRiskApprovals = new WeakSet<object>();

export class RiskApproval {
  private constructor(
    public readonly approvalId: ApprovalId,
    public readonly decisionId: DecisionId,
    public readonly proposalId: ProposalId,
    public readonly instrument: string,
    public readonly decision: DecisionStatus,
    public readonly reason: string,
    public readonly mode: ExecutionMode,
    public readonly issuer: RiskIssuer,
    public readonly validUntil: string,
    public readonly correlationId: CorrelationId,
    public readonly causationId: CausationId,
    public readonly riskLimits: RiskLimitSnapshot,
    public readonly killSwitchActive: boolean,
    public readonly timestamp: string,
    public readonly version: string,
  ) {}

  /**
   * Internal capability-gated factory. The authority token is intentionally
   * module-private; application code must obtain approvals from RiskGuardian.
   */
  static create(record: RiskApprovalRecord, authority: symbol): RiskApproval {
    if (authority !== riskGuardianAuthority) {
      throw new Error('Only RiskGuardian may issue a RiskApproval.');
    }
    if (record.issuer !== 'RiskGuardian') {
      throw new Error('RiskApproval issuer must be RiskGuardian.');
    }
    if (record.decision !== 'APPROVED') {
      throw new Error('Only APPROVED risk decisions can create an execution approval.');
    }
    if (
      !record.approvalId ||
      !record.decisionId ||
      !record.proposalId ||
      !record.instrument ||
      !record.correlationId ||
      !record.causationId
    ) {
      throw new Error('RiskApproval is missing mandatory identity or traceability metadata.');
    }

    const validUntil = Date.parse(record.validUntil);
    if (!Number.isFinite(validUntil) || validUntil <= Date.now()) {
      throw new Error('RiskApproval is expired or has an invalid expiry timestamp.');
    }

    const limits = record.riskLimits;
    if (
      !limits ||
      Object.values(limits).some((value) => !Number.isFinite(value) || value < 0) ||
      !Number.isInteger(limits.maxConcurrentTrades)
    ) {
      throw new Error('RiskApproval contains invalid risk limits.');
    }

    const frozenRiskLimits = Object.freeze({ ...record.riskLimits });
    const approval = new RiskApproval(
      record.approvalId,
      record.decisionId,
      record.proposalId,
      record.instrument,
      record.decision,
      record.reason,
      record.mode,
      record.issuer,
      record.validUntil,
      record.correlationId,
      record.causationId,
      frozenRiskLimits,
      record.killSwitchActive,
      record.timestamp,
      record.version,
    );

    Object.freeze(approval);
    validRiskApprovals.add(approval);
    return approval;
  }

  static isValid(value: unknown): value is RiskApproval {
    return typeof value === 'object' && value !== null && validRiskApprovals.has(value);
  }
}

export interface RiskGuardianPolicy {
  mode: ExecutionMode;
  simulationIsDefault: boolean;
  killSwitchActive: boolean;
  liveTradingEnabled: boolean;
}

export class RiskGuardian {
  static readonly issuer: RiskIssuer = 'RiskGuardian';

  constructor(private readonly policy: RiskGuardianPolicy) {}

  decide(proposal: ProbabilityProposal): RiskApproval {
    if (!proposal || !proposal.proposalId || !proposal.instrument) {
      throw new Error('Probability proposal is incomplete.');
    }
    if (this.policy.killSwitchActive) {
      throw new Error('Kill switch active; RiskGuardian cannot approve trade execution.');
    }
    if (
      this.policy.mode !== 'SIMULATION' ||
      !this.policy.simulationIsDefault ||
      this.policy.liveTradingEnabled ||
      proposal.mode !== 'SIMULATION'
    ) {
      throw new Error('RiskGuardian only authorizes simulation mode while live trading remains disabled.');
    }

    return RiskApproval.create(
      {
        approvalId: `appr-${Date.now()}` as ApprovalId,
        decisionId: `decision-${Date.now()}` as DecisionId,
        proposalId: proposal.proposalId,
        instrument: proposal.instrument,
        decision: 'APPROVED',
        reason: 'Approved under the Phase 1 simulation-only policy.',
        mode: 'SIMULATION',
        issuer: RiskGuardian.issuer,
        validUntil: new Date(Date.now() + 60_000).toISOString(),
        correlationId: proposal.correlationId,
        causationId: proposal.causationId,
        // Phase 1 placeholders only; production limits must come from a validated risk policy.
        riskLimits: {
          riskPerTrade: 1,
          dailyLossLimit: 2,
          maxExposure: 3,
          maxConcurrentTrades: 1,
        },
        killSwitchActive: false,
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
      riskGuardianAuthority,
    );
  }
}
