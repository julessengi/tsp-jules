import { AuthorizedExecution } from './decision-boundary';

export class Executor {
  constructor(
    private readonly mode: 'SIMULATION' | 'LIVE' = 'SIMULATION',
    private readonly killSwitchActive = false,
  ) {}

  execute(authorized: AuthorizedExecution): { ok: true; executionId: string; instrument: string; mode: 'SIMULATION' } {
    if (this.killSwitchActive) {
      throw new Error('Executor blocked by kill switch.');
    }
    if (this.mode !== 'SIMULATION') {
      throw new Error('Live execution is disabled by policy.');
    }
    if (!AuthorizedExecution.isValid(authorized)) {
      throw new Error('Executor requires a valid AuthorizedExecution token from DecisionBoundary.');
    }
    if (authorized.mode !== 'SIMULATION') {
      throw new Error('Executor only accepts simulation-mode authorization.');
    }
    const authorizationExpiry = Date.parse(authorized.expiration);
    if (!Number.isFinite(authorizationExpiry) || authorizationExpiry <= Date.now()) {
      throw new Error('Executor rejected an expired or invalid authorization.');
    }

    return {
      ok: true,
      executionId: `exec-${Date.now()}`,
      instrument: authorized.instrument,
      mode: 'SIMULATION',
    };
  }
}
