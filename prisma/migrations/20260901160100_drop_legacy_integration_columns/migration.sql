-- Structural step 2 of 2 — run only after the data-migration script has
-- populated name/config/credentials on every existing row. See the
-- previous migration's comment for the full sequencing.

-- Now guaranteed populated by the backfill script.
ALTER TABLE "Integration" ALTER COLUMN "name" SET NOT NULL;

-- The old Gmail-specific columns — their data now lives in
-- config (email) and credentials (accessToken/refreshToken, recombined
-- and re-encrypted as one blob).
ALTER TABLE "Integration" DROP COLUMN "email";
ALTER TABLE "Integration" DROP COLUMN "accessToken";
ALTER TABLE "Integration" DROP COLUMN "refreshToken";

-- The new shape allows multiple accounts per provider — dedup on the
-- account's own label instead.
CREATE UNIQUE INDEX "Integration_organisationId_provider_name_key"
  ON "Integration"("organisationId", "provider", "name");
