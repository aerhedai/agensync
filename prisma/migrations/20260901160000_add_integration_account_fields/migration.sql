-- Structural step 1 of 2 for generalizing Integration into "one connected
-- account" (see the Integration model's own comment in schema.prisma).
-- Adds the new shape as nullable/defaulted alongside the old Gmail-specific
-- columns, which stay in place until the data-migration script
-- (scripts/_tmp-migrate-integration-accounts.ts, run once against each
-- environment) has decrypted and repacked existing rows into the new
-- shape. The follow-up migration (drop_legacy_integration_columns) removes
-- the old columns and tightens constraints once that's done.

-- provider: enum -> plain string (see schema.prisma's comment on why)
ALTER TABLE "Integration" ALTER COLUMN "provider" TYPE TEXT;
DROP TYPE "IntegrationProvider";

-- New columns, nullable for now
ALTER TABLE "Integration" ADD COLUMN "name" TEXT;
ALTER TABLE "Integration" ADD COLUMN "config" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Integration" ADD COLUMN "credentials" TEXT;

-- expiresAt is meaningless for a future non-OAuth provider (e.g. a
-- webhook using a static secret) — widen to nullable.
ALTER TABLE "Integration" ALTER COLUMN "expiresAt" DROP NOT NULL;

-- Old unique constraint assumed "one integration per provider per org" —
-- no longer true once multiple accounts of the same provider are allowed.
DROP INDEX IF EXISTS "Integration_organisationId_provider_key";
