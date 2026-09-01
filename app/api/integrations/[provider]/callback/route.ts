import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

import * as integrationService from "@/lib/integrations/integration-service";
import {
  oauthPkceCookieName,
  oauthStateCookieName,
} from "@/lib/integrations/oauth-cookies";
import { getOAuthAdapter } from "@/lib/integrations/oauth-registry";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const adapter = getOAuthAdapter(provider);
  if (!adapter) {
    return NextResponse.json(
      { error: `Unknown OAuth provider: ${provider}` },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Derived from the incoming request's own Host header (same pattern as
  // app/settings/page.tsx's baseUrl) rather than request.url's origin —
  // behind a reverse proxy (found live: Tailscale Funnel during local
  // testing) request.url can reflect the server's own bind address
  // (localhost:3000) instead of the externally-visible host, sending the
  // final redirect somewhere the browser can't reach.
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? url.host;
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  const cookieStore = await cookies();
  const stateCookieName = oauthStateCookieName(provider);
  const expectedState = cookieStore.get(stateCookieName)?.value;
  cookieStore.delete(stateCookieName);

  const pkceCookieName = oauthPkceCookieName(provider);
  const codeVerifier = cookieStore.get(pkceCookieName)?.value;
  cookieStore.delete(pkceCookieName);

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/settings?error=${provider}:${encodeURIComponent(error)}`,
        baseUrl,
      ),
    );
  }
  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(
      new URL(`/settings?error=${provider}:invalid_state`, baseUrl),
    );
  }

  const result = await adapter.exchangeCode(code, codeVerifier);
  const organisation = await getCurrentOrganisation();

  // Upserts on (organisationId, provider, result.accountName) — reconnecting
  // the same account (e.g. re-authorizing the same Gmail address or Slack
  // workspace) updates that account's credentials; authorizing a different
  // account adds a new connected account rather than replacing this one.
  await integrationService.connectOAuthAccount(
    organisation.id,
    provider,
    result,
  );

  return NextResponse.redirect(
    new URL(`/settings?connected=${provider}`, baseUrl),
  );
}
