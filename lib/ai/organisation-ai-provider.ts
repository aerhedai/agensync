import type { AIProvider } from "@/lib/ai/provider";
import { OllamaProvider } from "@/lib/ai/providers/ollama-provider";
import * as integrationRepository from "@/lib/integrations/integration-repository";
import * as integrationService from "@/lib/integrations/integration-service";

// An AI provider connection is a Connection like any other (CLAUDE.md
// §4.1) — an authenticated link to an external system, owned by one
// organisation — so it's stored as an ordinary Integration rather than a
// bespoke table. "ollama" is the only kind actually implemented; this list
// exists so a second provider (a hosted commercial API) is an addition
// here, not a new storage model.
export const OLLAMA_PROVIDER = "ollama";

// Only one AI connection makes sense per organisation today — unlike
// Gmail/Slack, there's no "which one of several" concept yet (no
// Agent-level pin the way actionIntegrationId works for email/chat) — so
// every org's Ollama connection is upserted under this fixed name rather
// than a business-chosen label. Reconnecting always updates the same row.
const CONNECTION_NAME = "Default";

export interface OllamaProviderInput {
  baseUrl: string;
  // Optional: only needed when baseUrl points at the auth proxy in
  // scripts/ollama-auth-proxy.py, not plain local Ollama (see
  // OllamaProvider's own constructor comment).
  //
  // undefined on an update means "leave whatever's already stored" — the
  // Settings form's password field is never pre-filled with a real secret
  // (nothing server-rendered echoes it back), so "the field was submitted
  // blank" can't be told apart from "the business chose not to change it"
  // without this convention. Pass an explicit empty string to clear it.
  proxySecret?: string;
}

export interface OrganisationAIConnection {
  baseUrl: string;
  connectedAt: Date;
}

/**
 * Raised when an organisation has no AI provider connected. Every
 * organisation used to silently share one operator-configured Ollama
 * instance via a global env var — this is what closes that: an
 * organisation must explicitly connect its own provider before any agent
 * of theirs can run, no implicit fallback to anyone else's machine.
 */
export class AIProviderNotConfiguredError extends Error {
  constructor() {
    super(
      "No AI provider is connected for this organisation. Connect one in Settings → AI Provider.",
    );
    this.name = "AIProviderNotConfiguredError";
  }
}

export async function setOllamaProvider(
  organisationId: string,
  input: OllamaProviderInput,
): Promise<void> {
  let proxySecret: string | null;
  if (input.proxySecret === undefined) {
    const existing = await integrationService.getDefaultIntegrationByProvider(
      organisationId,
      OLLAMA_PROVIDER,
    );
    const existingSecret = existing?.credentials?.proxySecret;
    proxySecret = typeof existingSecret === "string" ? existingSecret : null;
  } else {
    proxySecret = input.proxySecret === "" ? null : input.proxySecret;
  }

  await integrationRepository.upsertIntegration(
    organisationId,
    OLLAMA_PROVIDER,
    CONNECTION_NAME,
    {
      config: {},
      credentials: { baseUrl: input.baseUrl, proxySecret },
    },
  );
}

export async function disconnectAIProvider(
  organisationId: string,
): Promise<void> {
  const existing = await integrationService.getDefaultIntegrationByProvider(
    organisationId,
    OLLAMA_PROVIDER,
  );
  if (existing) {
    await integrationService.disconnectIntegration(organisationId, existing.id);
  }
}

/**
 * For display only — baseUrl is shown as-is (not secret), proxySecret
 * never leaves this module. Returns null when nothing is connected, the
 * same "not connected" signal every other integration's status check uses.
 */
export async function getOrganisationAIConnection(
  organisationId: string,
): Promise<OrganisationAIConnection | null> {
  const integration = await integrationService.getDefaultIntegrationByProvider(
    organisationId,
    OLLAMA_PROVIDER,
  );
  if (!integration) return null;
  const baseUrl = integration.credentials?.baseUrl;
  if (typeof baseUrl !== "string") return null;
  return { baseUrl, connectedAt: integration.updatedAt };
}

/**
 * The one place that turns "this organisation's connected AI provider"
 * into a real AIProvider instance the runtime can call. Every caller in
 * lib/runtime/, lib/harness/ and lib/routing/ takes provider as a required
 * parameter (no default) precisely so this resolution happens once, at a
 * real request boundary, with a real organisationId — never buried behind
 * an implicit global fallback.
 */
export async function getAIProvider(
  organisationId: string,
): Promise<AIProvider> {
  const integration = await integrationService.getDefaultIntegrationByProvider(
    organisationId,
    OLLAMA_PROVIDER,
  );
  const baseUrl = integration?.credentials?.baseUrl;
  if (!integration || typeof baseUrl !== "string") {
    throw new AIProviderNotConfiguredError();
  }
  const proxySecret = integration.credentials?.proxySecret;
  return new OllamaProvider(
    baseUrl,
    typeof proxySecret === "string" ? proxySecret : undefined,
  );
}
