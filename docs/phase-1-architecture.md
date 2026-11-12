# Phase 1 â€” Executable architecture foundation

**Status: YELLOW â€” core decision-security foundation validated locally; platform runtime and Gate 1 remain incomplete.**

## Objective

Convert the repository from a documentation-heavy baseline into an executable, governance-aligned foundation for TSP-JULES while preserving the documented architecture and risk controls.

## Architecture rule

- Probability Engine proposes.
- Risk Guardian decides.
- DecisionBoundary validates and issues an AuthorizedExecution token.
- Executor accepts only a valid AuthorizedExecution token.
- Direct Probability Engine -> Executor execution is rejected.
- Simulation mode is mandatory.
- LIVE trading remains disabled.

## Security boundaries implemented

### A. Risk authority

`RiskApproval` can be issued only through the module-private RiskGuardian capability. Runtime validity is tracked by a private WeakSet; a plain object or copied approval cannot pass validation.

### B. Decision boundary

`AuthorizedExecution` can be issued only by `DecisionBoundary`, using a separate module-private capability. The boundary validates proposal identity, approval identity, instrument, mode, version, issuer, correlation ID, causation ID, expiry and kill-switch state.

### C. Executor

The Executor validates the runtime authorization token, simulation mode and expiry. It refuses raw proposals and forged authorization objects. No broker adapter or live order route exists.

### D. Dependency boundary

Dependency Cruiser enforces the source-level rules separating Probability Engine and Executor. The current scan passed with 10 modules and 10 dependencies, with no violations.

### E. Adversarial tests

The test suite covers valid simulation authorization, forged approvals, mismatched metadata, expiry, kill switch, LIVE mode rejection, direct Probability -> Executor imports, raw proposals, forged execution tokens and authority-gate bypass attempts.

## Local validation performed

Environment:
- Windows 10 Professional
- Node.js 24.22.2
- pnpm 11.13.1
- Local branch: `setup/local-machine`

Results:
- `pnpm install --frozen-lockfile`: PASS
- `pnpm test`: 24/24 PASS
- `pnpm run typecheck`: PASS
- `pnpm run build`: PASS
- `pnpm run lint`: PASS (10 modules, 10 dependencies, 0 violations)
- `docker compose config --quiet`: PASS (syntax validation only)

## Infrastructure limitation

Docker Desktop CLI is installed, but its Linux engine cannot connect. CPU virtualization support exists, but Intel VT-x is disabled in BIOS/UEFI; WSL and the Windows hypervisor are not operational on this machine. The Compose file has not been started; PostgreSQL and Redis are not running. The Compose configuration has been hardened to bind published ports to 127.0.0.1 and require PostgreSQL and Redis secrets.

The current repository also lacks:
- a materialized `apps/backend` application;
- actual workspace packages under `packages/*`;
- a NestJS API runtime;
- a Prisma schema and migrations;
- PostgreSQL and Redis runtime integration;
- authentication and user authorization;
- structured application logging and monitoring;
- a verified CI/CD run on GitHub and branch-protection rules (a local workflow file has been added but not yet executed remotely);
- an application dashboard or local web runtime.

The current RiskGuardian limits are placeholders. They are not a production quantitative risk engine.

## Phase 1 Gate Review

**Gate 1 is NOT PASSED.**

The decision-security proof is locally validated, but the Phase 1 platform deliverables in the roadmap are not complete. Do not start Market Data (Phase 2) until the backend, database, cache, secrets, CI/CD, authentication, logging, monitoring and local runtime are implemented and verified.

## Safety status

- LIVE trading: disabled.
- Broker connections: absent.
- Real order execution: absent.
- Simulation-only authorization: enforced.
- Production readiness: not claimed.
