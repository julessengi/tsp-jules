# TSP-JULES — Gate 1 Backend Operations

## Architecture delivered

- NestJS 12 API under `apps/backend`.
- PostgreSQL 16 persistence through Prisma 6.19.3.
- Redis 7 connection with fail-fast startup and readiness checks.
- JWT access tokens with a 15-minute default lifetime.
- Opaque 48-byte refresh tokens, SHA-256 hashed at rest and rotated on use.
- bcryptjs password hashing with 12 rounds.
- User roles ADMIN, TRADER and VIEWER; ADMIN-only audit endpoint.
- Public registration disabled by default.
- Bootstrap administrator created through the Prisma seed command.
- Audit events for successful login, failed login, registration, refresh and logout.
- Pino structured HTTP logging with credential redaction.
- Helmet security headers, DTO validation, CORS allowlist and request throttling.
- Liveness and PostgreSQL/Redis readiness endpoints.
- Docker Compose stack for PostgreSQL, Redis and API.
- GitHub Actions workflow with PostgreSQL/Redis services and authentication smoke tests.

## Local setup (Docker Desktop)

A private `.env` with independent random secrets was generated locally. Bootstrap credentials are saved in `.local\bootstrap-credentials.txt`; this directory is excluded from Git.

1. Enable CPU virtualization (VT-x) in BIOS/UEFI and start Docker Desktop Linux Engine.
2. From the repository root, run:

```powershell
corepack pnpm install --frozen-lockfile
docker compose up -d --build
docker compose exec backend pnpm --filter @tsp-jules/backend db:seed
docker compose ps
```

The backend container applies Prisma migrations before starting. The seed creates the initial administrator only if the email does not already exist; it never resets an existing password.

The host-side `.env` uses 127.0.0.1 for local development. Compose overrides the database and Redis URLs to use internal service DNS names.

## API routes

| Method | Route | Access |
|---|---|---|
| GET | /api/v1/health/live | Public liveness |
| GET | /api/v1/health/ready | PostgreSQL + Redis readiness |
| POST | /api/v1/auth/login | Public, rate limited |
| POST | /api/v1/auth/refresh | Public, rate limited |
| POST | /api/v1/auth/logout | Authenticated |
| GET | /api/v1/auth/me | Authenticated |
| POST | /api/v1/auth/register | Disabled unless explicitly enabled |
| GET | /api/v1/admin/users | ADMIN only |
| POST | /api/v1/admin/users | ADMIN only; provision account |
| GET | /api/v1/admin/audit | ADMIN only |

## Account security

- Keep public registration disabled for this private trading platform.
- Use a unique JWT secret of at least 32 characters.
- Keep `.env` and `.local` out of Git.
- Rotate the bootstrap administrator password after first sign-in.
- Access tokens are short-lived; refresh tokens are random, hashed in PostgreSQL, single-use and rotated.
- A revoked refresh token cannot be reused.
- Passwords and bearer/refresh tokens are redacted from HTTP logs.
- PostgreSQL and Redis ports are bound to localhost only in the development Compose file.
- LIVE trading and broker connections remain disabled.

## CI gate

The workflow `.github/workflows/ci.yml` starts isolated PostgreSQL and Redis services, installs the frozen lockfile, generates Prisma Client, applies migrations, seeds a CI-only administrator, builds and typechecks both codebases, runs tests and executes API smoke tests.

A local workflow file is not proof that GitHub Actions passed. The workflow must run after the branch is pushed. Repository branch protection is a separate GitHub setting.

## Current workstation limitation

The Windows workstation has 6 GB RAM and VT-x disabled in firmware. Docker's Linux engine is unavailable. The NestJS application, Prisma schema/client and unit tests have been built and validated locally, but PostgreSQL/Redis containers, live migrations and end-to-end API smoke tests cannot be declared operational until virtualization and Docker are running.
