import type { AuthorizedExecution } from './decision-boundary';

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
    if (authorized.mode !== 'SIMULATION') {
      throw new Error('Executor only accepts simulation-mode authorization.');
    }

    return {
      ok: true,
      executionId: `exec-${Date.now()}`,
      instrument: authorized.instrument,
      mode: 'SIMULATION',
    };
  }
}
