import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthorizedExecution, DecisionBoundary, type ExecutionRequest } from './decision-boundary';
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

  const guardian = new RiskGuardian({
    mode: 'SIMULATION',
    simulationIsDefault: true,
    killSwitchActive: false,
    liveTradingEnabled: false,
  });

  const defaultApproval = guardian.decide(proposal);

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

  afterEach(() => {
    vi.useRealTimers();
  });

  it('approves valid simulation execution through the decision boundary', () => {
    const boundary = new DecisionBoundary('SIMULATION', false);
    const authorization = boundary.authorize(defaultApproval, proposal, request);
    const executor = new Executor('SIMULATION', false);

    expect(AuthorizedExecution.isValid(authorization)).toBe(true);
    expect(executor.execute(authorization).ok).toBe(true);
  });

  it('freezes issued approvals and execution authorizations at runtime', () => {
    const authorization = new DecisionBoundary().authorize(defaultApproval, proposal, request);

    expect(Object.isFrozen(defaultApproval)).toBe(true);
    expect(Object.isFrozen(defaultApproval.riskLimits)).toBe(true);
    expect(Object.isFrozen(authorization)).toBe(true);
  });

  it('rejects a forged non-approved risk decision', () => {
    const forgedRejectedApproval = {
      ...defaultApproval,
      decision: 'REJECTED',
    };

    expect(() =>
      new DecisionBoundary().authorize(forgedRejectedApproval as any, proposal, request),
    ).toThrow(/invalid or forged RiskApproval/i);
  });

  it('rejects mismatched approval metadata', () => {
    const boundary = new DecisionBoundary('SIMULATION', false);

    expect(() =>
      boundary.authorize(defaultApproval, proposal, {
        ...request,
        approvalId: 'wrong-approval-id' as any,
      }),
    ).toThrow(/Approval ID mismatch/i);
  });

  it('rejects caller-supplied untrusted provenance', () => {
    expect(() =>
      new DecisionBoundary().authorize(defaultApproval, proposal, {
        ...request,
        provenance: 'ExternalCaller' as any,
      }),
    ).toThrow(/provenance must be RiskGuardian/i);
  });

  it('rejects expired approvals', () => {
    vi.useFakeTimers();

    const freshApproval = guardian.decide(proposal);
    const freshRequest = {
      ...request,
      approvalId: freshApproval.approvalId,
      decisionId: freshApproval.decisionId,
      expiration: new Date(Date.now() + 60_000).toISOString(),
    };

    vi.advanceTimersByTime(60_001);

    expect(() =>
      new DecisionBoundary().authorize(freshApproval, proposal, freshRequest),
    ).toThrow(/expired/i);
  });

  it('rejects kill switch activation', () => {
    const boundary = new DecisionBoundary('SIMULATION', true);

    expect(() => boundary.authorize(defaultApproval, proposal, request)).toThrow(/kill switch/i);
  });

  it('rejects live mode when simulation-first is required', () => {
    const liveProposal = { ...proposal, mode: 'LIVE' as const };

    expect(() =>
      new DecisionBoundary('SIMULATION', false).authorize(defaultApproval, liveProposal, {
        ...request,
        mode: 'LIVE',
      }),
    ).toThrow(/simulation/i);
  });

  it('Probability Engine does not import Executor directly', () => {
    const source = readFileSync(resolve(process.cwd(), 'probability-engine.ts'), 'utf8');

    expect(source).not.toMatch(/from ['\"]\.\/executor['\"]/);
  });

  it('Executor API rejects raw proposals at runtime', () => {
    const executor = new Executor('SIMULATION', false);

    expect(() => executor.execute({ proposalId: 'prop-raw' } as any)).toThrow(
      /valid AuthorizedExecution token/i,
    );
  });

  it('RiskGuardian is the sole authorization issuer', () => {
    expect(() => RiskApproval.create(defaultApproval, Symbol())).toThrow(
      /Only RiskGuardian may issue/i,
    );
    expect(RiskApproval.isValid(defaultApproval)).toBe(true);
  });

  it('DecisionBoundary is the only authorization gate', () => {
    expect(() => AuthorizedExecution.fromApproval(defaultApproval, request, Symbol())).toThrow(
      /Only DecisionBoundary may issue/i,
    );
  });

  it('RiskGuardian refuses live proposals and live policy', () => {
    const liveGuardian = new RiskGuardian({
      mode: 'LIVE',
      simulationIsDefault: false,
      killSwitchActive: false,
      liveTradingEnabled: true,
    });

    expect(() =>
      liveGuardian.decide({ ...proposal, mode: 'LIVE' }),
    ).toThrow(/simulation mode/i);
  });

  it('rejects unbranded authorization objects even if their fields look valid', () => {
    const executor = new Executor('SIMULATION', false);
    const forgedAuthorization = { ...defaultApproval, mode: 'SIMULATION' };

    expect(() => executor.execute(forgedAuthorization as any)).toThrow(
      /valid AuthorizedExecution token/i,
    );
  });
});
