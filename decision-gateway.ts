export type DecisionStatus = 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type ExecutionMode = 'SIMULATION' | 'LIVE';
export type RiskSource = 'RiskGuardian';

export interface EventEnvelope {
  eventId: string;
  timestamp: string;
  source: string;
  type: string;
  version: string;
  correlationId: string;
  causationId: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface TradeProposal {
  proposalId: string;
  instrument: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  strategyId: string;
  probability: number;
  confidence: number;
  evidence: string[];
  invalidation: string[];
  timestamp: string;
}

export interface RiskApproval {
  approvalId: string;
  decisionId: string;
  proposalId: string;
  instrument: string;
  decision: DecisionStatus;
  reason: string;
  mode: ExecutionMode;
  issuer: RiskSource;
  validUntil: string;
  riskLimits: {
    riskPerTrade: number;
    dailyLossLimit: number;
    maxExposure: number;
    maxConcurrentTrades: number;
  };
  killSwitchActive: boolean;
  timestamp: string;
}

export interface ExecutionAttempt {
  attemptId: string;
  requestId: string;
  proposalId: string;
  approvalId: string;
  decisionId: string;
  instrument: string;
  mode: ExecutionMode;
  timestamp: string;
}

export interface RiskGatewayConfig {
  mode: ExecutionMode;
  killSwitchActive: boolean;
  maxConcurrentTrades: number;
  dailyLossLimit: number;
  riskPerTrade: number;
  maxExposure: number;
  liveTradingEnabled: boolean;
}

export function createDecisionEnvelope(
  source: string,
  type: string,
  correlationId: string,
  causationId: string,
  payload: Record<string, unknown>,
  metadata: Record<string, unknown> = {},
): EventEnvelope {
  return {
    eventId: cryptoRandomId(),
    timestamp: new Date().toISOString(),
    source,
    type,
    version: '1.0',
    correlationId,
    causationId,
    payload,
    metadata,
  };
}

export function validateRiskApproval(
  approval: RiskApproval,
  config: RiskGatewayConfig,
  now = new Date(),
): { valid: boolean; reason?: string } {
  if (!approval || typeof approval !== 'object') {
    return { valid: false, reason: 'Approval is missing or malformed.' };
  }

  if (approval.issuer !== 'RiskGuardian') {
    return { valid: false, reason: 'Approval issuer must be RiskGuardian.' };
  }

  if (!approval.approvalId || !approval.decisionId || !approval.proposalId || !approval.instrument) {
    return { valid: false, reason: 'Approval is incomplete.' };
  }

  if (approval.decision !== 'APPROVED') {
    return { valid: false, reason: `Risk decision is ${approval.decision}; executor is not allowed to act.` };
  }

  if (!config.liveTradingEnabled && config.mode !== 'SIMULATION') {
    return { valid: false, reason: 'Live trading is disabled by default.' };
  }

  if (approval.mode !== config.mode) {
    return { valid: false, reason: 'Approval mode must match current execution mode.' };
  }

  if (config.killSwitchActive || approval.killSwitchActive) {
    return { valid: false, reason: 'Kill switch is active; no execution allowed.' };
  }

  const approvalExpiry = Date.parse(approval.validUntil);
  if (!Number.isFinite(approvalExpiry) || approvalExpiry <= now.getTime()) {
    return { valid: false, reason: 'Approval expired or has an invalid expiry timestamp.' };
  }

  if (
    !approval.riskLimits ||
    Object.values(approval.riskLimits).some((value) => !Number.isFinite(value) || value < 0)
  ) {
    return { valid: false, reason: 'Approval contains invalid risk limits.' };
  }

  if (approval.riskLimits.riskPerTrade > config.riskPerTrade) {
    return { valid: false, reason: 'Risk per trade exceeds configured limit.' };
  }

  if (approval.riskLimits.dailyLossLimit > config.dailyLossLimit) {
    return { valid: false, reason: 'Daily loss limit would be violated.' };
  }

  if (approval.riskLimits.maxExposure > config.maxExposure) {
    return { valid: false, reason: 'Maximum exposure would be exceeded.' };
  }

  if (approval.riskLimits.maxConcurrentTrades > config.maxConcurrentTrades) {
    return { valid: false, reason: 'Concurrent trade limit would be exceeded.' };
  }

  return { valid: true };
}

export function assertApprovalMatchesRequest(
  approval: RiskApproval,
  attempt: ExecutionAttempt,
): { valid: boolean; reason?: string } {
  if (approval.approvalId !== attempt.approvalId) {
    return { valid: false, reason: 'Approval ID does not match execution request.' };
  }

  if (approval.decisionId !== attempt.decisionId) {
    return { valid: false, reason: 'Risk decision ID does not match execution request.' };
  }

  if (approval.proposalId !== attempt.proposalId) {
    return { valid: false, reason: 'Proposal ID does not match approval.' };
  }

  if (approval.instrument !== attempt.instrument) {
    return { valid: false, reason: 'Instrument mismatch between approval and execution request.' };
  }

  return { valid: true };
}

export function executeIfApproved(
  approval: RiskApproval,
  config: RiskGatewayConfig,
  attempt: ExecutionAttempt,
  now = new Date(),
): { allowed: boolean; status: 'EXECUTED' | 'REJECTED'; reason?: string } {
  const validation = validateRiskApproval(approval, config, now);

  if (!validation.valid) {
    return { allowed: false, status: 'REJECTED', reason: validation.reason };
  }

  const match = assertApprovalMatchesRequest(approval, attempt);
  if (!match.valid) {
    return { allowed: false, status: 'REJECTED', reason: match.reason };
  }

  if (approval.mode !== 'SIMULATION' || attempt.mode !== 'SIMULATION' || config.mode !== 'SIMULATION') {
    return { allowed: false, status: 'REJECTED', reason: 'This executor is simulation-first only.' };
  }

  return { allowed: true, status: 'EXECUTED' };
}

function cryptoRandomId(): string {
  return `evt-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}
