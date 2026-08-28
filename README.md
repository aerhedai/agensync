# Agensync

AI-powered business process automation platform. See [`CLAUDE.md`](./CLAUDE.md) for the full product and engineering specification, and the [project board](https://github.com/orgs/aerhedai/projects/4) for what's done and what's next.

## Status

Phase 1 (project foundation) — nearly complete. Next.js App Router, TypeScript strict mode, Tailwind CSS, ESLint/Prettier, shadcn/ui, Docker Compose (PostgreSQL), Prisma, and CI are all wired up and verified end to end. No domain models, tools, or agent runtime yet — that's Phase 2 onward.

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
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), and confirm the database connection is live:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","database":"connected"}
```

> PostgreSQL is published on host port **5433**, not the default 5432 — this avoids colliding with any other local Postgres install (Homebrew, Postgres.app, etc.) you may already have running. See `docker-compose.yml`.

Ollama is not run via Docker Compose here — during development it runs on a separate machine, reached over Tailscale via the `OLLAMA_BASE_URL` environment variable (used starting Phase 4).

## Scripts

| Command                             | Purpose                |
| ----------------------------------- | ---------------------- |
| `pnpm dev`                          | Start the dev server   |
| `pnpm build`                        | Production build       |
| `pnpm start`                        | Run a production build |
| `pnpm lint`                         | ESLint                 |
| `pnpm format` / `pnpm format:check` | Prettier               |
| `pnpm typecheck`                    | `tsc --noEmit`         |
| `pnpm test` / `pnpm test:watch`     | Vitest                 |

CI (`.github/workflows/ci.yml`) runs all of the above (install → lint → format:check → typecheck → test → build) on every push and pull request to `main`.

## Workflow

Every prompt given to Claude Code in this repo is logged automatically to `transcript/prompts.md`, and frontend changes are gated behind a screenshot requirement before a PR can be opened — both enforced via hooks in `.claude/settings.json`, documented in [`CLAUDE.md` §40](./CLAUDE.md). Once Phase 1 is complete, all further work moves to a `dev`-branch-first workflow with protected `main`/`dev` branches — see issue [#16](https://github.com/aerhedai/agensync/issues/16).
