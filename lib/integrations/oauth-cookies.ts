// Shared cookie options for the OAuth round trip's short-lived, per-attempt
// secrets (CSRF state, PKCE code_verifier) — used by both
// app/api/integrations/[provider]/connect and .../callback so the two
// routes can't silently drift out of sync on how these are set.
export function oauthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 600,
    path: "/",
  };
}

export function oauthStateCookieName(provider: string): string {
  return `${provider}_oauth_state`;
}

export function oauthPkceCookieName(provider: string): string {
  return `${provider}_oauth_pkce_verifier`;
}
