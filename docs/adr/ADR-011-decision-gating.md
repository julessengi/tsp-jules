# ADR-011 — Decision gating and risk authority

- Status: ADOPTED (architecture decision hardened, but runtime validation remains incomplete in this shell-limited environment)
- Date: 2026-08-17

## Context

The documentation defines a strict governance chain:

Market -> Sentinel -> Analyst -> Strategy Engine -> Probability Engine -> Risk Guardian -> Decision Boundary -> Executor -> Historian -> Coach AI

The TRF and the architecture baseline explicitly require:

- Probability Engine proposes
- Risk Guardian decides
- Executor executes only after authorization
- RiskRejected and RiskSuspended must stop execution
- a kill switch must stop execution
- simulation-first mode is the default
- direct Probability -> Executor paths are disallowed

The repository previously documented this policy without a real enforcement point. A design-only enforcement is not sufficient.

## Decision

We adopt an explicit authorization boundary between the probability and execution domains.

The execution pipeline cannot act unless a valid RiskApproval is transformed into an AuthorizedExecution token by the Decision Boundary. The token is the only object accepted by the Executor.

The core rule is:

- Probability Engine emits proposals
- Risk Guardian emits APPROVED / REJECTED / SUSPENDED
- DecisionBoundary validates proposal, decision, approval, instrument, mode, correlation, causation, provenance, and expiry
- Executor validates only an AuthorizedExecution object and rejects any raw proposal or direct call path
- direct Probability Engine -> Executor flows are rejected by design
- simulation mode remains the default execution mode

## Why this model

A plain `if (approval.status === 'APPROVED')` check is not sufficient because it protects only one branch and does not create a real authority boundary. The design implemented here adds protection at several levels:

- type boundary with non-trivial authorization classes
- API boundary with `Executor.execute(authorizedExecution)`
- provenance and identity validation
- expiration, replay, and mismatch rejection
- simulation-first and kill-switch enforcement

This does not claim that the architecture is impossible to bypass in every runtime environment. It claims that the normal software path is hardened in a way that requires a RiskGuardian-led authorization flow and rejects raw execution attempts.

## Consequences

### Positive

- The governance rule is enforced in code, not only in documentation
- Execution attempts become traceable and auditable
- Simulation-first mode can be enforced centrally
- RiskGuardian remains the single authorization authority
- The decision boundary becomes the controlled handoff between proposal and execution

### Negative

- More ceremony is required in the execution flow
- The model requires explicit authorization tokens rather than synthetic direct calls
- A fully runtime-validated monorepo remains blocked by the shell/tooling limitations in this environment

## Alternative considered

A looser direct call from Probability Engine to Executor was considered. This was rejected because it bypasses the TRF rule and allows a probabilistic signal to execute without risk decision or auditable provenance.

## Implementation notes

The enforcement logic is distributed across `risk-guardian.ts`, `decision-boundary.ts`, and `executor.ts`, with adversarial validation in `phase1-hardening.test.ts`. The project remains YELLOW because real command execution (`pnpm install`, `pnpm test`, `pnpm build`, Docker validation) was not possible here.
