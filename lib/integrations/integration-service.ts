import { randomBytes, timingSafeEqual } from "node:crypto";

import * as integrationRepository from "@/lib/integrations/integration-repository";
import { refreshAccessToken } from "@/lib/integrations/gmail/oauth";
import type { GmailTokens } from "@/lib/integrations/gmail/oauth";

// Refresh a little before actual expiry so a token never goes stale
// mid-request.
const EXPIRY_SAFETY_MARGIN_MS = 60_000;
const GMAIL_PROVIDER = "gmail";
const WEBHOOK_PROVIDER = "webhook";

interface GmailCredentials {
  accessToken: string;
  refreshToken: string;
}

function asGmailCredentials(
  credentials: Record<string, unknown> | null,
): GmailCredentials {
  if (
    !credentials ||
    typeof credentials.accessToken !== "string" ||
    typeof credentials.refreshToken !== "string"
  ) {
    throw new Error(
      "Gmail integration is missing valid credentials — reconnect it from Settings.",
    );
  }
  return {
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken,
  };
}

// Every connected account, across every provider — the data behind the
// Settings "boxes" UI (lib/integrations/integration-registry.ts groups
// these by provider for display).
export function listIntegrations(organisationId: string) {
  return integrationRepository.findIntegrationsByOrganisation(organisationId);
}

export function listIntegrationsByProvider(
  organisationId: string,
  provider: string,
) {
  return integrationRepository.findIntegrationsByProvider(
    organisationId,
    provider,
  );
}

export function getIntegration(organisationId: string, integrationId: string) {
  return integrationRepository.findIntegrationById(
    organisationId,
    integrationId,
  );
}

export function disconnectIntegration(
  organisationId: string,
  integrationId: string,
) {
  return integrationRepository.deleteIntegration(organisationId, integrationId);
}

export function connectGmailAccount(
  organisationId: string,
  email: string,
  tokens: GmailTokens,
) {
  return integrationRepository.upsertIntegration(
    organisationId,
    GMAIL_PROVIDER,
    email,
    {
      config: { email },
      credentials: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
      expiresAt: tokens.expiresAt,
    },
  );
}

/**
 * "Default" = earliest-connected Gmail account for this organisation.
 * There's no concept yet of a workflow picking a specific account — every
 * org-wide Gmail action (the dashboard's "Check inbox" button, the
 * send_email tool) uses whichever account was connected first. Correct by
 * construction for the common case (one account), a real known limitation
 * once a business connects two and expects both to be used — flagged
 * here deliberately rather than silently papered over.
 */
export async function getDefaultGmailIntegration(organisationId: string) {
  const integrations = await integrationRepository.findIntegrationsByProvider(
    organisationId,
    GMAIL_PROVIDER,
  );
  return integrations[0] ?? null;
}

/**
 * Returns a Gmail access token guaranteed valid for immediate use,
 * refreshing and persisting a new one first if the stored token is expired
 * or about to expire. Throws if Gmail isn't connected for this org.
 *
 * integrationId, when provided (an agent's actionIntegrationId), pins this
 * to that *specific* connected Gmail account instead of the org's default
 * — looked up via findIntegrationById, so it's still organisation-scoped
 * even though the id itself came from the agent record, not this call's
 * own arguments. Falls back to getDefaultGmailIntegration when omitted,
 * same behavior as before this parameter existed.
 */
export async function getValidGmailAccessToken(
  organisationId: string,
  integrationId?: string | null,
): Promise<string> {
  const integration = integrationId
    ? await integrationRepository.findIntegrationById(
        organisationId,
        integrationId,
      )
    : await getDefaultGmailIntegration(organisationId);
  if (!integration) {
    throw new Error(
      "Gmail is not connected for this organisation. Connect it from Settings.",
    );
  }
  if (integration.provider !== GMAIL_PROVIDER) {
    throw new Error("The bound action account is not a Gmail account.");
  }
  const credentials = asGmailCredentials(integration.credentials);

  const expiresSoon =
    !integration.expiresAt ||
    integration.expiresAt.getTime() - Date.now() < EXPIRY_SAFETY_MARGIN_MS;
  if (!expiresSoon) {
    return credentials.accessToken;
  }

  const refreshed = await refreshAccessToken(credentials.refreshToken);
  await integrationRepository.updateIntegrationCredentials(
    integration.id,
    {
      accessToken: refreshed.accessToken,
      refreshToken: credentials.refreshToken,
    },
    refreshed.expiresAt,
  );
  return refreshed.accessToken;
}

/**
 * Creates a new webhook account and returns the plaintext secret exactly
 * once — every other read of this integration only ever sees the
 * encrypted form. The caller (the one-time confirmation UI) must show it
 * immediately and never persist or log it itself.
 */
export async function connectWebhookAccount(
  organisationId: string,
  name: string,
) {
  const secret = randomBytes(32).toString("hex");
  const integration = await integrationRepository.upsertIntegration(
    organisationId,
    WEBHOOK_PROVIDER,
    name,
    { config: {}, credentials: { secret } },
  );
  return { integration, secret };
}

/**
 * The entire authentication boundary for the inbound webhook endpoint,
 * which has no session — a timing side-channel on the secret comparison
 * here is a real vulnerability, not a theoretical one, hence
 * timingSafeEqual rather than `===`.
 */
export async function verifyWebhookSecret(
  integrationId: string,
  providedSecret: string,
): Promise<{ organisationId: string } | null> {
  const integration =
    await integrationRepository.findIntegrationByIdUnscoped(integrationId);
  if (!integration || integration.provider !== WEBHOOK_PROVIDER) {
    return null;
  }
  const storedSecret = integration.credentials?.secret;
  if (typeof storedSecret !== "string") {
    return null;
  }

  const stored = Buffer.from(storedSecret);
  const provided = Buffer.from(providedSecret);
  if (stored.length !== provided.length || !timingSafeEqual(stored, provided)) {
    return null;
  }
  return { organisationId: integration.organisationId };
}
