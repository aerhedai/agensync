import { prisma } from "@/lib/db/prisma";
import type { GmailTokens } from "@/lib/integrations/gmail/oauth";

export function findGmailIntegration(organisationId: string) {
  return prisma.integration.findUnique({
    where: { organisationId_provider: { organisationId, provider: "GMAIL" } },
  });
}

export function upsertGmailIntegration(
  organisationId: string,
  email: string,
  tokens: GmailTokens,
) {
  return prisma.integration.upsert({
    where: { organisationId_provider: { organisationId, provider: "GMAIL" } },
    update: {
      email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    },
    create: {
      organisationId,
      provider: "GMAIL",
      email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
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
    data: { accessToken, expiresAt },
  });
}

export function deleteGmailIntegration(organisationId: string) {
  return prisma.integration.deleteMany({
    where: { organisationId, provider: "GMAIL" },
  });
}
