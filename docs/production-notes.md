# Production Hardening Notes

Deliberate V1 simplifications that are fine for local development but must be
addressed before any real deployment. Each entry names the gap, why it was
accepted for now, and what closing it looks like.

## Gmail OAuth tokens stored in plaintext (Phase 9)

`Integration.accessToken` / `Integration.refreshToken` (`prisma/schema.prisma`)
are stored as plain text in Postgres.

**Why accepted for V1:** tokens are server-side only (never sent to the
browser, never logged, never committed — CLAUDE.md §22), and CLAUDE.md's
guiding principle is not to add infrastructure before there's a demonstrated
need (§4, §30). Encryption-at-rest requires key management (where does the
encryption key live? rotation policy?) that has no real answer yet for a
single-tenant local dev setup.

**What closing it looks like:** encrypt both columns (e.g. AES-256-GCM) with
a key sourced from a proper secrets manager (not another env var sitting next
to the thing it protects), before onboarding any real customer data or
deploying outside local development.
