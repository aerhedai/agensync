import { randomBytes, timingSafeEqual } from "node:crypto";

import type { Prisma } from "@/lib/generated/prisma/client";
import * as integrationRepository from "@/lib/integrations/integration-repository";
import { refreshAccessToken } from "@/lib/integrations/gmail/oauth";
import type { GmailTokens } from "@/lib/integrations/gmail/oauth";
import type { OAuthExchangeResult } from "@/lib/integrations/oauth-adapter";

// Refresh a little before actual expiry so a token never goes stale
// mid-request.
const EXPIRY_SAFETY_MARGIN_MS = 60_000;
const GMAIL_PROVIDER = "gmail";
const SLACK_PROVIDER = "slack";
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

interface SlackCredentials {
  botToken: string;
}

function asSlackCredentials(
  credentials: Record<string, unknown> | null,
): SlackCredentials {
  if (!credentials || typeof credentials.botToken !== "string") {
    throw new Error(
      "Slack integration is missing valid credentials — reconnect it from Settings.",
    );
  }
  return { botToken: credentials.botToken };
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

/**
 * The generic upsert every OAuth provider's callback route
 * (app/api/integrations/[provider]/callback) funnels through — a thin
 * wrapper over upsertIntegration keyed on the adapter's own exchange
 * result shape (lib/integrations/oauth-adapter.ts), so a new OAuth
 * provider never needs its own connect* function here.
 */
export function connectOAuthAccount(
  organisationId: string,
  provider: string,
  result: OAuthExchangeResult,
) {
  return integrationRepository.upsertIntegration(
    organisationId,
    provider,
    result.accountName,
    {
      // OAuthExchangeResult.config is declared as Record<string, unknown>
      // (a generic interface, not Prisma-aware) but every adapter
      // (gmailOAuthAdapter, slackOAuthAdapter) only ever populates it with
      // plain strings — genuinely JSON-safe, just not provably so to
      // Prisma.InputJsonValue's structural type.
      config: result.config as Prisma.InputJsonValue,
      credentials: result.credentials,
      expiresAt: result.expiresAt,
    },
  );
}

// Predates connectOAuthAccount (Gmail was the only OAuth provider at the
// time) — kept as its own function so existing callers/tests don't need to
// build a GmailTokens value into an OAuthExchangeResult shape by hand.
export function connectGmailAccount(
  organisationId: string,
  email: string,
  tokens: GmailTokens,
) {
  return connectOAuthAccount(organisationId, GMAIL_PROVIDER, {
    accountName: email,
    config: { email },
    credentials: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
    expiresAt: tokens.expiresAt,
  });
}

/**
 * "Default" = earliest-connected account of this provider for this
 * organisation. There's no concept yet of a workflow picking a specific
 * account by default — every org-wide action for a provider uses whichever
 * account was connected first, unless a caller pins a specific
 * integrationId (see getValidGmailAccessToken/getSlackBotToken). Correct by
 * construction for the common case (one account), a known limitation once
 * a business connects two and expects both to be used by default — flagged
 * here deliberately rather than silently papered over.
 */
export async function getDefaultIntegrationByProvider(
  organisationId: string,
  provider: string,
) {
  const integrations = await integrationRepository.findIntegrationsByProvider(
    organisationId,
    provider,
  );
  return integrations[0] ?? null;
}

export function getDefaultGmailIntegration(organisationId: string) {
  return getDefaultIntegrationByProvider(organisationId, GMAIL_PROVIDER);
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
 * Returns a Slack bot token for immediate use. Unlike getValidGmailAccessToken,
 * there's no refresh branch — Slack bot tokens don't expire in the standard
 * (non-token-rotation) OAuth flow this app uses, so once connected, a
 * token is valid until the business disconnects or revokes it. integrationId
 * pins to a specific connected workspace the same way as Gmail's version;
 * omitted, falls back to the organisation's default (earliest-connected)
 * Slack workspace.
 */
export async function getSlackBotToken(
  organisationId: string,
  integrationId?: string | null,
): Promise<string> {
  const integration = integrationId
    ? await integrationRepository.findIntegrationById(
        organisationId,
        integrationId,
      )
    : await getDefaultIntegrationByProvider(organisationId, SLACK_PROVIDER);
  if (!integration) {
    throw new Error(
      "Slack is not connected for this organisation. Connect it from Settings.",
    );
  }
  if (integration.provider !== SLACK_PROVIDER) {
    throw new Error("The bound action account is not a Slack account.");
  }
  return asSlackCredentials(integration.credentials).botToken;
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
