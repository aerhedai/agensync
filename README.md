# Agensync

AI-powered business process automation platform. See [`CLAUDE.md`](./CLAUDE.md) for the full product and engineering specification, and the [project board](https://github.com/orgs/aerhedai/projects/4) for what's done and what's next.

## Status

Phase 1 (project foundation) is complete. Phase 2 (database) is underway: core domain models (Organisation, User, Agent, AgentRun, RunStep) exist with a migration and a seed script. No tools, UI, or agent runtime yet — that's Phase 3 onward.

## Prerequisites

- [Node.js](https://nodejs.org) 24 (see `.nvmrc` — `nvm use` if you have nvm installed)
- [pnpm](https://pnpm.io)
- [Docker](https://www.docker.com) (Docker Desktop or equivalent, for local PostgreSQL)

## Setup

```bash
git clone https://github.com/aerhedai/agensync.git
cd agensync

pnpm install          # also generates the Prisma client (postinstall)
cp .env.example .env.local

docker compose up -d  # starts PostgreSQL on localhost:5433
pnpm exec prisma migrate deploy

pnpm dev
```

Every page requires a real signed-in Clerk session — there's no seed-script
shortcut. Fill in `.env.local`'s `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` /
`CLERK_SECRET_KEY` (from a free [Clerk](https://clerk.com) application's
dashboard → API Keys, with Organizations enabled in that dashboard) and
`TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`), then open
[http://localhost:3000](http://localhost:3000) and sign up — the app
provisions your organisation and a working Email Handling workflow
automatically on first sign-in (`lib/organisations/current-organisation.ts`).

Confirm the database connection is live independently of auth:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","database":"connected"}
```

> PostgreSQL is published on host port **5433**, not the default 5432 — this avoids colliding with any other local Postgres install (Homebrew, Postgres.app, etc.) you may already have running. See `docker-compose.yml`.

Ollama is not run via Docker Compose here — during development it runs on a separate machine, reached over Tailscale via the `OLLAMA_BASE_URL` environment variable (used starting Phase 4).

## Scripts

| Command                             | Purpose                          |
| ----------------------------------- | -------------------------------- |
| `pnpm dev`                          | Start the dev server             |
| `pnpm build`                        | Production build                 |
| `pnpm start`                        | Run a production build           |
| `pnpm lint`                         | ESLint                           |
| `pnpm format` / `pnpm format:check` | Prettier                         |
| `pnpm typecheck`                    | `tsc --noEmit`                   |
| `pnpm test` / `pnpm test:watch`     | Vitest                           |
| `pnpm db:migrate`                   | Create + apply a migration (dev) |
| `pnpm db:seed`                      | No-op — see `prisma/seed.ts`     |

CI (`.github/workflows/ci.yml`) runs a real Postgres service, applies migrations, then: install → lint → format:check → typecheck → migrate → test → build, on every push and pull request to `main`.

## Workflow

Every prompt given to Claude Code in this repo is logged automatically to a local, gitignored `transcript/prompts.md`, and frontend changes are gated behind a screenshot requirement before a PR can be opened — both enforced via hooks in `.claude/settings.json`, documented in [`CLAUDE.md` §40](./CLAUDE.md). `main` and `dev` are protected: no direct pushes, PRs required, `ci` must pass. Feature branches are cut from `dev`.
