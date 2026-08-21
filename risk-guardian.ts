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

const approvalBrand = Symbol('RiskApproval');

export class RiskApproval {
  private readonly [approvalBrand] = true;

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

  static create(record: RiskApprovalRecord): RiskApproval {
    if (record.issuer !== 'RiskGuardian') {
      throw new Error('RiskApproval must be issued by RiskGuardian.');
    }
    if (record.decision !== 'APPROVED') {
      throw new Error('Only APPROVED risk decisions can be transformed into an execution authorization.');
    }
    if (!record.correlationId || !record.causationId) {
      throw new Error('RiskApproval requires correlationId and causationId.');
    }
    if (new Date(record.validUntil).getTime() <= Date.now()) {
      throw new Error('RiskApproval is expired.');
    }
    return new RiskApproval(
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
      record.riskLimits,
      record.killSwitchActive,
      record.timestamp,
      record.version,
    );
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
    if (!this.policy.simulationIsDefault && this.policy.mode === 'LIVE') {
      throw new Error('Simulation mode is required by default; live trading is disabled.');
    }
    if (this.policy.killSwitchActive) {
      throw new Error('Kill switch active; RiskGuardian cannot approve trade execution.');
    }

    return RiskApproval.create({
      approvalId: `appr-${Date.now()}` as ApprovalId,
      decisionId: `decision-${Date.now()}` as DecisionId,
      proposalId: proposal.proposalId,
      instrument: proposal.instrument,
      decision: 'APPROVED',
      reason: 'Proposal was evaluated and approved under the active policy.',
      mode: proposal.mode,
      issuer: 'RiskGuardian',
      validUntil: new Date(Date.now() + 60_000).toISOString(),
      correlationId: proposal.correlationId,
      causationId: proposal.causationId,
      riskLimits: {
        riskPerTrade: 1,
        dailyLossLimit: 2,
        maxExposure: 3,
        maxConcurrentTrades: 1,
      },
      killSwitchActive: false,
      timestamp: new Date().toISOString(),
      version: '1.0',
    });
  }
}
