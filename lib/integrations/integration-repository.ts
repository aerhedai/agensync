import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";
import { prisma } from "@/lib/db/prisma";
import type { Integration, Prisma } from "@/lib/generated/prisma/client";

export interface ResolvedIntegration extends Omit<Integration, "credentials"> {
  // Decrypted and JSON-parsed — never the raw ciphertext string above this
  // layer. Null when the row has no credentials (a future provider that
  // doesn't need any) or none were ever set.
  credentials: Record<string, unknown> | null;
}

// The single chokepoint every Integration.credentials read/write funnels
// through — same shape as the old Gmail-specific version of this file, now
// operating on one encrypted JSON blob instead of two separately-encrypted
// columns (see schema.prisma's comment on Integration.credentials).
function decryptIntegration(integration: Integration): ResolvedIntegration {
  return {
    ...integration,
    credentials: integration.credentials
      ? (JSON.parse(decryptToken(integration.credentials)) as Record<
          string,
          unknown
        >)
      : null,
  };
}

function encryptCredentials(
  credentials: Record<string, unknown> | null,
): string | null {
  return credentials ? encryptToken(JSON.stringify(credentials)) : null;
}

export async function findIntegrationsByOrganisation(organisationId: string) {
  const integrations = await prisma.integration.findMany({
    where: { organisationId },
    orderBy: [{ provider: "asc" }, { createdAt: "asc" }],
  });
  return integrations.map(decryptIntegration);
}

export async function findIntegrationsByProvider(
  organisationId: string,
  provider: string,
) {
  const integrations = await prisma.integration.findMany({
    where: { organisationId, provider },
    orderBy: { createdAt: "asc" },
  });
  return integrations.map(decryptIntegration);
}

export async function findIntegrationById(organisationId: string, id: string) {
  const integration = await prisma.integration.findFirst({
    where: { id, organisationId },
  });
  return integration ? decryptIntegration(integration) : null;
}

/**
 * Deliberately NOT organisationId-scoped — used only by the inbound
 * webhook endpoint (app/api/webhooks/[integrationId]/route.ts), which by
 * definition doesn't know the organisation until it's found this row.
 * Safe because the id itself is an unguessable cuid (not enumerable) and
 * the caller must still verify the request's secret against this row's
 * credentials before trusting anything — this lookup alone grants
 * nothing. Every other caller in the app should use findIntegrationById.
 */
export async function findIntegrationByIdUnscoped(id: string) {
  const integration = await prisma.integration.findUnique({ where: { id } });
  return integration ? decryptIntegration(integration) : null;
}

/**
 * Keyed on the (organisationId, provider, name) unique constraint —
 * reconnecting the same account (e.g. re-authorizing the same Gmail
 * address) updates its row; a different name is a genuinely new account.
 */
export function upsertIntegration(
  organisationId: string,
  provider: string,
  name: string,
  data: {
    config: Prisma.InputJsonValue;
    credentials: Record<string, unknown> | null;
    expiresAt?: Date | null;
  },
) {
  const credentials = encryptCredentials(data.credentials);
  return prisma.integration.upsert({
    where: {
      organisationId_provider_name: { organisationId, provider, name },
    },
    update: { config: data.config, credentials, expiresAt: data.expiresAt },
    create: {
      organisationId,
      provider,
      name,
      config: data.config,
      credentials,
      expiresAt: data.expiresAt,
    },
  });
}

export function updateIntegrationCredentials(
  id: string,
  credentials: Record<string, unknown>,
  expiresAt?: Date,
) {
  return prisma.integration.update({
    where: { id },
    data: { credentials: encryptCredentials(credentials), expiresAt },
  });
}

export function deleteIntegration(organisationId: string, id: string) {
  return prisma.integration.deleteMany({ where: { id, organisationId } });
}
