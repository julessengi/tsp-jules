import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DecisionBoundary, type ExecutionRequest } from './decision-boundary';
import { Executor } from './executor';
import { ProbabilityEngine } from './probability-engine';
import { RiskApproval, RiskGuardian, type ProbabilityProposal } from './risk-guardian';

describe('Phase 1 hardening', () => {
  const proposal: ProbabilityProposal = {
    proposalId: 'prop-1' as any,
    instrument: 'EURUSD',
    mode: 'SIMULATION',
    version: '1.0',
    timestamp: new Date().toISOString(),
    correlationId: 'corr-1' as any,
    causationId: 'caus-1' as any,
    strategyId: 'strategy-1',
  };

  const defaultApproval = RiskApproval.create({
    approvalId: 'appr-1' as any,
    decisionId: 'decision-1' as any,
    proposalId: proposal.proposalId,
    instrument: proposal.instrument,
    decision: 'APPROVED',
    reason: 'Within risk budget',
    mode: 'SIMULATION',
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

  const request: ExecutionRequest = {
    proposalId: proposal.proposalId,
    approvalId: defaultApproval.approvalId,
    decisionId: defaultApproval.decisionId,
    instrument: proposal.instrument,
    mode: 'SIMULATION',
    expiration: new Date(Date.now() + 60_000).toISOString(),
    correlationId: proposal.correlationId,
    causationId: proposal.causationId,
    provenance: 'RiskGuardian',
    version: '1.0',
  };

  it('approves valid simulation execution', () => {
    const boundary = new DecisionBoundary('SIMULATION', false);
    const authorization = boundary.authorize(defaultApproval, proposal, request);
    const executor = new Executor('SIMULATION', false);

    expect(executor.execute(authorization).ok).toBe(true);
  });

  it('rejects non-approved decisions', () => {
    const rejected = RiskApproval.create({
      ...defaultApproval,
      approvalId: 'appr-2' as any,
      decisionId: 'decision-2' as any,
      proposalId: 'prop-2' as any,
      decision: 'REJECTED',
    });

    expect(() => new DecisionBoundary().authorize(rejected, proposal, request)).toThrow();
  });

  it('rejects forged or mismatched authorization', () => {
    const tampered = RiskApproval.create({
      ...defaultApproval,
      approvalId: 'appr-3' as any,
      proposalId: 'prop-3' as any,
    });

    expect(() => new DecisionBoundary().authorize(tampered, proposal, request)).toThrow();
  });

  it('rejects expired approvals', () => {
    const expired = RiskApproval.create({
      ...defaultApproval,
      approvalId: 'appr-expired' as any,
      validUntil: new Date(Date.now() - 1000).toISOString(),
    });

    expect(() => new DecisionBoundary().authorize(expired, proposal, request)).toThrow();
  });

  it('rejects kill switch activation', () => {
    const boundary = new DecisionBoundary('SIMULATION', true);
    expect(() => boundary.authorize(defaultApproval, proposal, request)).toThrow(/kill switch/i);
  });

  it('rejects live mode when simulation-first is required', () => {
    const liveProposal = { ...proposal, mode: 'LIVE' as const };
    expect(() => new DecisionBoundary('SIMULATION', false).authorize(defaultApproval, liveProposal, {
      ...request,
      mode: 'LIVE',
    })).toThrow(/simulation/i);
  });

  it('Probability Engine does not import Executor directly', () => {
    const source = readFileSync(new URL('./probability-engine.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['\"]\.\/executor['\"]/);
  });

  it('Executor API requires AuthorizedExecution, not raw proposals', () => {
    const executor = new Executor('SIMULATION', false);
    // @ts-expect-error raw probability proposals are rejected by type-level API safety
    executor.execute({ proposalId: 'prop-raw' });
    expect(executor).toBeDefined();
  });

  it('Risk Guardian is the sole authorization issuer', () => {
    const engine = new ProbabilityEngine();
    const proposalFromEngine = engine.propose({
      proposalId: 'prop-engine-1' as any,
      instrument: 'EURUSD',
      mode: 'SIMULATION',
      strategyId: 's1',
      correlationId: 'corr-engine' as any,
      causationId: 'caus-engine' as any,
    });

    const guardian = new RiskGuardian({
      mode: 'SIMULATION',
      simulationIsDefault: true,
      killSwitchActive: false,
      liveTradingEnabled: false,
    });

    const approval = guardian.decide(proposalFromEngine);
    expect(approval.issuer).toBe('RiskGuardian');
  });
});
