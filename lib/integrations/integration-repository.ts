import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";
import { prisma } from "@/lib/db/prisma";
import type { Integration } from "@/lib/generated/prisma/client";
import type { GmailTokens } from "@/lib/integrations/gmail/oauth";

// This file is the single chokepoint every Integration.accessToken/
// refreshToken read and write funnels through — encrypt-on-write and
// decrypt-on-read live entirely here so nothing above this layer
// (integration-service.ts, the Gmail route handlers, lib/integrations/
// gmail/{oauth,client}.ts) ever touches ciphertext or needs to know
// encryption exists at all.
function decryptIntegration<T extends Integration | null>(integration: T): T {
  if (!integration) return integration;
  return {
    ...integration,
    accessToken: decryptToken(integration.accessToken),
    refreshToken: decryptToken(integration.refreshToken),
  };
}

export async function findGmailIntegration(organisationId: string) {
  const integration = await prisma.integration.findUnique({
    where: { organisationId_provider: { organisationId, provider: "GMAIL" } },
  });
  return decryptIntegration(integration);
}

export function upsertGmailIntegration(
  organisationId: string,
  email: string,
  tokens: GmailTokens,
) {
  const accessToken = encryptToken(tokens.accessToken);
  const refreshToken = encryptToken(tokens.refreshToken);

  return prisma.integration.upsert({
    where: { organisationId_provider: { organisationId, provider: "GMAIL" } },
    update: {
      email,
      accessToken,
      refreshToken,
      expiresAt: tokens.expiresAt,
    },
    create: {
      organisationId,
      provider: "GMAIL",
      email,
      accessToken,
      refreshToken,
      expiresAt: tokens.expiresAt,
    },
  });
}

export function updateGmailAccessToken(
  organisationId: string,
  accessToken: string,
  expiresAt: Date,
) {
  return prisma.integration.update({
    where: { organisationId_provider: { organisationId, provider: "GMAIL" } },
    data: { accessToken: encryptToken(accessToken), expiresAt },
  });
}

export function deleteGmailIntegration(organisationId: string) {
  return prisma.integration.deleteMany({
    where: { organisationId, provider: "GMAIL" },
  });
}
