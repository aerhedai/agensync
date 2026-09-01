import { env } from "@/lib/env";
import * as microsoftCore from "@/lib/integrations/microsoft/oauth-core";
import type { OAuthAdapter } from "@/lib/integrations/oauth-adapter";

const OUTLOOK_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/Mail.Send",
];

function requireOutlookRedirectUri(): string {
  if (!env.MICROSOFT_OUTLOOK_REDIRECT_URI) {
    throw new Error(
      "Outlook integration is not configured — set MICROSOFT_OUTLOOK_REDIRECT_URI.",
    );
  }
  return env.MICROSOFT_OUTLOOK_REDIRECT_URI;
}

export function buildOutlookAuthUrl(state: string): string {
  return microsoftCore.buildMicrosoftAuthUrl(
    state,
    OUTLOOK_SCOPES,
    requireOutlookRedirectUri(),
  );
}

export function exchangeOutlookCode(
  code: string,
): Promise<microsoftCore.MicrosoftTokens> {
  return microsoftCore.exchangeCodeForTokens(code, requireOutlookRedirectUri());
}

// The generic connect/callback routes drive Outlook through this shared
// interface, same as Gmail/Slack — no route code needs to know Outlook
// exists.
export const outlookOAuthAdapter: OAuthAdapter = {
  provider: "outlook",
  buildAuthUrl: buildOutlookAuthUrl,
  async exchangeCode(code) {
    const tokens = await exchangeOutlookCode(code);
    // tokens.email (from the id_token) is preferred — see
    // decodeIdTokenEmail's comment for why. Graph's /me is only a
    // fallback for the rare case the id_token didn't carry an email
    // claim, since /me has shown real backend flakiness for some accounts.
    const accountName =
      tokens.email ??
      (await microsoftCore.getMicrosoftProfile(tokens.accessToken)).mail;
    if (!accountName) {
      throw new Error(
        "Could not determine this Outlook account's email address.",
      );
    }
    return {
      accountName,
      config: { email: accountName },
      credentials: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
      expiresAt: tokens.expiresAt,
    };
  },
};
