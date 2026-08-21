# Phase 1 — Executable architecture foundation

Status: YELLOW — hardening in progress; not ready for Phase 2

## Objective

Convert the repository from a documentation-only baseline into an executable, governance-aligned foundation for TSP-JULES while preserving the documented architecture and risk controls.

## Architecture chosen

We retain the documented architecture and formalize the risk gating boundary as a distinct authorization step.

Core rule enforced in software:

- Probability Engine proposes
- Risk Guardian decides
- DecisionBoundary validates and issues an AuthorizedExecution token
- Executor executes only after an AuthorizedExecution token is produced by the guarded boundary
- direct Probability -> Executor is rejected by design and by API contract
- simulation mode is default
- no live trading without explicit human approval and verified runtime policy

### Layered security model

The protection is intentionally multi-layered:

A. Type boundary: a `RiskApproval` instance is not a plain object and is created only by a factory.
B. Module boundary: `ProbabilityEngine` and `Executor` are kept separate at the source-code level.
C. Dependency boundary: the policy is to prevent direct import and call paths from probability to execution.
D. Runtime validation: identity, expiry, cycle metadata, issuer, mode, and kill-switch checks are enforced before execution.
E. Adversarial tests: malformed, forged, expired, replayed, and mismatched approvals are rejected.
F. Traceability: correlation and causation IDs are required and recorded.

Important limitation: the repository contains a stronger design-time boundary than a fully validated runtime deployment, because the environment here does not offer a shell capable of running Node, pnpm, Docker, or Git.

## Files created

- `risk-guardian.ts`
- `decision-boundary.ts`
- `executor.ts`
- `probability-engine.ts`
- `phase1-hardening.test.ts`
- `tsconfig.json`
- `decision-gateway.ts`
- `decision-gateway.test.ts`
- `.env.example`
- `turbo.json`
- `docs/adr/ADR-011-decision-gating.md`

## Files modified

- `package.json`
- `README.md`
- `PROJET_STATE.md.txt`

## Risks and constraints

- This environment does not expose a usable PowerShell / Node / pnpm / Docker runtime, so runtime verification is limited in this sandbox.
- The repository still lacks a fully materialized monorepo tree because the filesystem tooling available here cannot create nested directories such as `packages/risk` or `apps/backend`.
- Therefore, the code is a hardened architectural proof, not a production-validated runtime.

## Validation criteria

- Type-safe risk gate exists
- Approvals are refused when decision state is not APPROVED
- Kill switch blocks execution
- Simulation mode is the default
- Event envelopes include correlationId and causationId
- Probability Engine does not import Executor
- Executor accepts only AuthorizedExecution tokens

## Current status

The governance rule is now encoded in a stronger boundary model, but the project remains YELLOW rather than GREEN because runtime execution, dependency-enforcement proof, and Docker validation were not available in this environment.
