# TSP-JULES

> Trading Smart Platform

Status: Phase 1 — Hardening required, runtime validation blocked by shell/tooling limitations

## Governance baseline

The repository follows the canonical documentation under `docs/`, with the architecture baseline and RFCs treated as the source of truth. Historical snapshots under `v1/` and `v2/` are retained only for comparison and are not authoritative unless explicitly overridden.

## Core architectural rule

Probability Engine proposes.
Risk Guardian decides.
Executor executes only after valid authorization.

This is enforced by the risk-authorization boundary in `risk-guardian.ts`, `decision-boundary.ts`, and `executor.ts`, and is documented in `docs/adr/ADR-011-decision-gating.md`.

## Current implementation state

Documented: YES
Designed: YES
Scaffolded: YES
Implemented: PARTIAL (hardening layer exists, but the environment does not permit a fully materialized multi-package monorepo runtime)
Tested: PARTIAL (static adversarial tests and protection patterns are in place, but no actual runtime test command could be executed here)
Integrated: NOT YET
Deployed: NO

## Important security note

This repository implements a stronger architectural protection pattern than a bare `if (approval.status === 'APPROVED')` gate. The boundary is explicit in code:

- RiskGuardian is the only issuer authorized to create a valid approval.
- DecisionBoundary is the only gate that can transform that approval into an AuthorizedExecution.
- Executor accepts only `AuthorizedExecution`; no raw proposal is accepted by its normal API.
- Simulation mode is the default and live execution remains blocked without an explicit and audited policy path.
- Correlation and causation IDs are mandatory.
- Expiration, replay, and kill-switch protection are enforced in the authorization path.

However, the repository still cannot claim a fully validated runtime architecture because the execution environment here does not provide a working PowerShell, Node, pnpm, Docker, or Git shell. This means `pnpm install`, `pnpm test`, `pnpm build`, and Docker validation remain unexecuted in this session.

## Repository intent

This project is being transformed from a documentation-heavy repository into a real execution-ready platform with the following priorities:

- modular domain boundaries and traceable authorization
- event-driven orchestration
- strict risk authorization boundary
- simulation-first execution by default
- auditability and correlation IDs
- Docker and CI/CD readiness

## Runtime rules

- LIVE_TRADING must remain disabled by default
- risk rejection must block execution
- risk suspension must block execution
- kill switch must block execution
- direct Probability Engine -> Executor flow is rejected by architectural design and by API contract
- no runtime claim is made without actual command evidence

## Reference documents

- `docs/ARCHITECTURE_BASELINE_CHANGELOG.md.txt`
- `docs/adr/ADR-REGISTER - Architecture Decision Register.txt`
- `docs/rfcs/RFC-006 — Trading Risk Framework.md.txt`
- `docs/rfcs/RFC-007 — System Architecture Document (SAD).md.txt`
- `docs/rfcs/RFC-011 — Event Catalog.md.txt`
- `docs/rfcs/RFC-012 — API Contract.md.txt`
- `docs/rfcs/RFC-013 — Database Schema.md.txt`
- `docs/rfcs/RFC-014 — Infrastructure Architecture.md.txt`
- `docs/rfcs/RFC-016 — Security Architecture.md.txt`

## Phase 1 artifacts

- `risk-guardian.ts`
- `decision-boundary.ts`
- `executor.ts`
- `probability-engine.ts`
- `phase1-hardening.test.ts`
- `decision-gateway.ts`
- `decision-gateway.test.ts`
- `docs/adr/ADR-011-decision-gating.md`
- `docs/phase-1-architecture.md`
- `.env.example`
- `turbo.json`
