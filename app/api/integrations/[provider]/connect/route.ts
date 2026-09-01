import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  oauthCookieOptions,
  oauthPkceCookieName,
  oauthStateCookieName,
} from "@/lib/integrations/oauth-cookies";
import { getOAuthAdapter } from "@/lib/integrations/oauth-registry";
import { generatePkcePair } from "@/lib/integrations/pkce";

// No session system is consulted here (the organisation is only resolved
// once the callback comes back) — this state value is pure CSRF protection
// for the OAuth round trip, not user identity. Cookie name is scoped per
// provider so two connect attempts for different providers in flight at
// once (unlikely, but possible with two Settings tabs open) can't clobber
// each other's state.
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

  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(oauthStateCookieName(provider), state, oauthCookieOptions());

  // Only providers that need PKCE (adapter.usesPkce — Slack, since its
  // redirect_uri isn't a real HTTPS URL during local dev) get a
  // code_verifier generated and persisted; buildAuthUrl simply ignores an
  // undefined codeChallenge for every other provider.
  let codeChallenge: string | undefined;
  if (adapter.usesPkce) {
    const pkce = generatePkcePair();
    cookieStore.set(
      oauthPkceCookieName(provider),
      pkce.codeVerifier,
      oauthCookieOptions(),
    );
    codeChallenge = pkce.codeChallenge;
  }

  return NextResponse.redirect(adapter.buildAuthUrl(state, codeChallenge));
}
