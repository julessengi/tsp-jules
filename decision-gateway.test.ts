import { describe, expect, it } from 'vitest';
import {
  createDecisionEnvelope,
  executeIfApproved,
  type ExecutionAttempt,
  type RiskApproval,
  type RiskGatewayConfig,
} from './decision-gateway';

describe('RiskGuard gating', () => {
  const config: RiskGatewayConfig = {
    mode: 'SIMULATION',
    liveTradingEnabled: false,
    killSwitchActive: false,
    maxConcurrentTrades: 3,
    dailyLossLimit: 500,
    riskPerTrade: 100,
    maxExposure: 1000,
  };

  const buildApproval = (overrides: Partial<RiskApproval> = {}): RiskApproval => ({
    approvalId: 'appr-1',
    decisionId: 'decision-1',
    proposalId: 'prop-1',
    instrument: 'EURUSD',
    decision: 'APPROVED',
    reason: 'Within risk budget',
    mode: 'SIMULATION',
    issuer: 'RiskGuardian',
    validUntil: new Date(Date.now() + 60_000).toISOString(),
    riskLimits: {
      riskPerTrade: 60,
      dailyLossLimit: 300,
      maxExposure: 800,
      maxConcurrentTrades: 2,
    },
    killSwitchActive: false,
    timestamp: new Date().toISOString(),
    ...overrides,
  });

  const buildAttempt = (overrides: Partial<ExecutionAttempt> = {}): ExecutionAttempt => ({
    attemptId: 'try-1',
    requestId: 'req-1',
    proposalId: 'prop-1',
    approvalId: 'appr-1',
    decisionId: 'decision-1',
    instrument: 'EURUSD',
    mode: 'SIMULATION',
    timestamp: new Date().toISOString(),
    ...overrides,
  });

  it('allows execution when probability-proposed risk is approved', () => {
    const approval = buildApproval();
    const result = executeIfApproved(approval, config, buildAttempt());

    expect(result.allowed).toBe(true);
    expect(result.status).toBe('EXECUTED');
  });

  it('blocks direct Probability -> Executor path when risk is rejected', () => {
    const approval = buildApproval({ decision: 'REJECTED', approvalId: 'appr-2', proposalId: 'prop-2' });
    const result = executeIfApproved(approval, config, buildAttempt({ proposalId: 'prop-2', approvalId: 'appr-2' }));

    expect(result.allowed).toBe(false);
    expect(result.status).toBe('REJECTED');
  });

  it('blocks execution when risk is suspended', () => {
    const approval = buildApproval({ decision: 'SUSPENDED', approvalId: 'appr-3', proposalId: 'prop-3' });
    const result = executeIfApproved(approval, config, buildAttempt({ proposalId: 'prop-3', approvalId: 'appr-3' }));

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Risk decision is SUSPENDED');
  });

  it('blocks execution when kill switch is active', () => {
    const approval = buildApproval({ killSwitchActive: true, approvalId: 'appr-4' });
    const result = executeIfApproved(approval, { ...config, killSwitchActive: true }, buildAttempt({ approvalId: 'appr-4' }));

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Kill switch');
  });

  it('blocks execution when approval is expired', () => {
    const approval = buildApproval({ validUntil: new Date(Date.now() - 1000).toISOString() });
    const result = executeIfApproved(approval, config, buildAttempt());

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Approval expired');
  });

  it('blocks execution when instrument mismatch occurs', () => {
    const approval = buildApproval({ instrument: 'EURUSD' });
    const result = executeIfApproved(approval, config, buildAttempt({ instrument: 'GBPUSD' }));

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Instrument mismatch');
  });

  it('blocks execution when decision ID mismatch occurs', () => {
    const approval = buildApproval({ decisionId: 'decision-abc' });
    const result = executeIfApproved(approval, config, buildAttempt({ decisionId: 'decision-def' }));

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('decision ID');
  });

  it('blocks live execution while trading is disabled by default', () => {
    const approval = buildApproval({ mode: 'LIVE' });
    const result = executeIfApproved(approval, { ...config, mode: 'LIVE', liveTradingEnabled: false }, buildAttempt({ mode: 'LIVE' }));

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Live trading');
  });

  it('blocks execution without approval metadata', () => {
    const malformedApproval = {
      approvalId: '',
      decisionId: '',
      proposalId: '',
      instrument: '',
      decision: 'APPROVED',
      reason: 'Malformed',
      mode: 'SIMULATION',
      issuer: 'RiskGuardian',
      validUntil: new Date(Date.now() + 60_000).toISOString(),
      riskLimits: { riskPerTrade: 10, dailyLossLimit: 30, maxExposure: 50, maxConcurrentTrades: 1 },
      killSwitchActive: false,
      timestamp: new Date().toISOString(),
    } as any;

    const result = executeIfApproved(malformedApproval, config, buildAttempt({ approvalId: '', decisionId: '', proposalId: '', instrument: '' }));

    expect(result.allowed).toBe(false);
  });

  it('creates event envelopes with traceability metadata', () => {
    const envelope = createDecisionEnvelope(
      'ProbabilityEngine',
      'TradeProposed',
      'corr-123',
      'caus-456',
      {
        proposalId: 'prop-4',
        instrument: 'EURUSD',
        side: 'BUY',
      },
      { strategyVersion: 'v1.0', modelVersion: 'm-2026-08' },
    );

    expect(envelope.type).toBe('TradeProposed');
    expect(envelope.correlationId).toBe('corr-123');
    expect(envelope.causationId).toBe('caus-456');
    expect(envelope.metadata.strategyVersion).toBe('v1.0');
  });
});
