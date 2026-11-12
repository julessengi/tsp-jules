# TSP-JULES

> Trading Smart Platform — Technology, Skills & Performance

**Phase 1 status: YELLOW — decision-security core and NestJS backend compile locally; PostgreSQL/Redis runtime and GitHub CI execution remain to be verified.**

## Repository and workstation

- Repository: https://github.com/julessengi/tsp-jules.git
- Local path: `C:\Users\papa\Documents\TSP-JULES`
- Working branch: `setup/local-machine`
- Base commit: `dff83a1`
- Runtime: Node.js 24.22.2
- Package manager: pnpm 11.13.1

## Gate 1 backend

The workspace now contains a real NestJS 12 application under `apps/backend`.

Implemented components:
- PostgreSQL 16 persistence through Prisma 6.19.3.
- Prisma models and initial migration: User, RefreshToken, AuditLog.
- Redis 7 connection with fail-fast startup and readiness check.
- JWT access tokens (15-minute default).
- Random refresh tokens, SHA-256 hashed at rest, rotated on use and revocable.
- bcryptjs password hashing (12 rounds).
- Roles ADMIN, TRADER and VIEWER, with ADMIN-only user provisioning, user listing and audit endpoints.
- Public registration disabled by default.
- Bootstrap administrator seed; existing credentials are never overwritten.
- Pino structured HTTP logging with password and token redaction.
- Helmet, DTO validation, CORS allowlist and request throttling.
- Liveness and dependency readiness endpoints.
- Docker Compose for PostgreSQL, Redis and API.
- GitHub Actions workflow with real PostgreSQL/Redis services and API smoke tests.

## Local validation completed

| Check | Result |
|---|---:|
| Frozen pnpm dependency installation | PASS |
| Prisma schema validation | PASS |
| Prisma Client generation | PASS |
| NestJS backend build | PASS |
| NestJS backend typecheck | PASS |
| Backend unit tests | 7/7 PASS |
| Core build and typecheck | PASS |
| Full project unit tests | 31/31 PASS |
| Frontend JavaScript / preview syntax | PASS |
| Dependency architecture check | 0 violations |
| Docker Compose configuration | PASS |

The seven backend unit tests cover credential verification, failed-login audit, disabled public registration, refresh-token rotation/reuse rejection and role-based access control.

## Start the local stack

A private `.env` with independent random secrets has been generated on the workstation. The initial administrator credentials are stored in the ignored file `.local\bootstrap-credentials.txt`.

1. Enable Intel VT-x in BIOS/UEFI and start Docker Desktop Linux Engine.
2. From the repository root, run:

```powershell
corepack pnpm install --frozen-lockfile
docker compose up -d --build
docker compose exec backend pnpm --filter @tsp-jules/backend db:seed
docker compose ps
```

The backend container applies Prisma migrations before starting. The seed command creates the administrator only when the configured email does not already exist.

The API will be available at `http://127.0.0.1:3001/api/v1`.

## API routes

| Method | Route | Access |
|---|---|---|
| GET | /health/live | Public liveness |
| GET | /health/ready | Public dependency readiness |
| POST | /auth/login | Public, rate limited |
| POST | /auth/refresh | Public, rate limited |
| POST | /auth/register | Disabled unless explicitly enabled |
| POST | /auth/logout | Authenticated |
| GET | /auth/me | Authenticated |
| GET | /admin/users | ADMIN only |
| POST | /admin/users | ADMIN only; provision account |
| GET | /admin/audit | ADMIN only |

## Frontend — espace de pilotage

Une interface Web responsive est servie par le backend NestJS depuis `apps/frontend/public`.

- Connexion JWT et renouvellement des sessions.
- Vue générale avec disponibilité réelle de l'API, PostgreSQL et Redis.
- Administration des comptes réservée au rôle ADMIN.
- Consultation du journal d'audit réservée au rôle ADMIN.
- Interface en français, navigation mobile et identité visuelle TSP.
- Aucun formulaire d'ordre de marché ni connexion courtier ; le mode reste SIMULATION.

Après démarrage du backend et de PostgreSQL/Redis, ouvrir `http://127.0.0.1:3001`. Le frontend et l'API partagent la même origine ; aucun serveur frontend séparé n'est requis.

Validation frontend : `corepack pnpm run check:frontend`. Pour afficher l'interface indépendamment des conteneurs, lancer `corepack pnpm dev:frontend` puis ouvrir `http://127.0.0.1:4173` ; les appels API sont relayés vers le backend local sur le port 3001.

## CI/CD

`.github/workflows/ci.yml` now:
- installs the frozen pnpm lockfile;
- starts isolated PostgreSQL and Redis services;
- generates Prisma Client and applies migrations;
- seeds a CI-only administrator;
- builds and typechecks the core and backend;
- runs unit and architecture tests;
- starts the API and tests readiness, login, JWT authentication, ADMIN user provisioning, ADMIN allow / VIEWER deny, refresh rotation and logout.

The branch `setup/local-machine` has been pushed to GitHub. The resulting GitHub Actions run has not yet been verified from this workstation. Branch protection is a separate repository setting and has not been enabled.

## Remaining Gate 1 blockers

- Docker Linux Engine unavailable because VT-x is disabled in firmware.
- PostgreSQL and Redis containers have not yet started on this PC.
- The Prisma migration has not been applied to a live database.
- End-to-end smoke tests are prepared for CI but have not run against live services.
- GitHub Actions execution after the branch push remains to be verified.
- Branch protection and production secrets are not configured.

The Compose ports bind to localhost only. Do not expose this development stack publicly.

## Trading safety

- LIVE trading remains disabled.
- No broker adapter or real order route exists.
- TradingView, Deriv and MetaTrader are not connected.
- Risk limits in RiskGuardian remain Phase 1 placeholders, not a production quantitative risk model.
- No financial-performance or production-readiness claim is made.

## Commands

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm db:generate
corepack pnpm run build
corepack pnpm run build:api
corepack pnpm run typecheck
corepack pnpm run typecheck:api
corepack pnpm test
corepack pnpm run test:api
corepack pnpm run lint
```

The separate folder `TSP-JULES2` remains an independent local decision studio; it is not this repository's API or frontend.
