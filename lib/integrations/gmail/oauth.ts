import { env } from "@/lib/env";
import { getGmailProfile } from "@/lib/integrations/gmail/client";
import type { OAuthAdapter } from "@/lib/integrations/oauth-adapter";

// gmail.modify covers reading messages and marking them read (removing the
// UNREAD label); sending needs its own scope on top of that.
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

export interface GmailTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

function requireGoogleConfig() {
  if (
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.GOOGLE_REDIRECT_URI
  ) {
    throw new Error(
      "Gmail integration is not configured — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI.",
    );
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  };
}

export function buildGoogleAuthUrl(state: string): string {
  const { clientId, redirectUri } = requireGoogleConfig();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

async function requestToken(
  body: URLSearchParams,
): Promise<GoogleTokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await response.json()) as GoogleTokenResponse;

  if (!response.ok) {
    throw new Error(
      `Google token request failed: ${data.error_description ?? data.error ?? response.statusText}`,
    );
  }
  return data;
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<GmailTokens> {
  const { clientId, clientSecret, redirectUri } = requireGoogleConfig();

  const data = await requestToken(
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  );

  if (!data.refresh_token) {
    throw new Error(
      "Google did not return a refresh token — revoke Agensync's access at https://myaccount.google.com/permissions and reconnect so Google issues a fresh one.",
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const { clientId, clientSecret } = requireGoogleConfig();

  const data = await requestToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  );

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

// The generic connect/callback routes (app/api/integrations/[provider]/)
// drive Gmail through this shared interface instead of Gmail-specific route
// code — the extra getGmailProfile call to resolve the connected email
// address happens here, inside the adapter, so the generic callback route
// never needs to branch on provider.
export const gmailOAuthAdapter: OAuthAdapter = {
  provider: "gmail",
  buildAuthUrl: buildGoogleAuthUrl,
  async exchangeCode(code) {
    const tokens = await exchangeCodeForTokens(code);
    const profile = await getGmailProfile(tokens.accessToken);
    return {
      accountName: profile.emailAddress,
      config: { email: profile.emailAddress },
      credentials: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
      expiresAt: tokens.expiresAt,
    };
  },
};
