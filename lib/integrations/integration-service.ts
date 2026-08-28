import * as integrationRepository from "@/lib/integrations/integration-repository";
import { refreshAccessToken } from "@/lib/integrations/gmail/oauth";

// Refresh a little before actual expiry so a token never goes stale
// mid-request.
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

export function getGmailIntegration(organisationId: string) {
  return integrationRepository.findGmailIntegration(organisationId);
}

/**
 * Returns a Gmail access token guaranteed valid for immediate use,
 * refreshing and persisting a new one first if the stored token is expired
 * or about to expire. Throws if Gmail isn't connected for this org.
 */
export async function getValidGmailAccessToken(
  organisationId: string,
): Promise<string> {
  const integration =
    await integrationRepository.findGmailIntegration(organisationId);
  if (!integration) {
    throw new Error(
      "Gmail is not connected for this organisation. Connect it from Settings.",
    );
  }

  const expiresSoon =
    integration.expiresAt.getTime() - Date.now() < EXPIRY_SAFETY_MARGIN_MS;
  if (!expiresSoon) {
    return integration.accessToken;
  }

  const refreshed = await refreshAccessToken(integration.refreshToken);
  await integrationRepository.updateGmailAccessToken(
    organisationId,
    refreshed.accessToken,
    refreshed.expiresAt,
  );
  return refreshed.accessToken;
}

export function disconnectGmail(organisationId: string) {
  return integrationRepository.deleteGmailIntegration(organisationId);
}
