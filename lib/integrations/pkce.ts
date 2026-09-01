import { createHash, randomBytes } from "node:crypto";

// RFC 7636 (Proof Key for Code Exchange) — required by Slack's OAuth for
// any redirect_uri that isn't a real HTTPS URL (localhost during local dev
// counts as "non-web" in Slack's eyes: "Must use PKCE to redirect to a
// non-web URI", hit live while testing this). code_verifier must be
// 43-128 chars from [A-Za-z0-9-._~]; 32 random bytes base64url-encoded
// lands at 43 chars, comfortably in range.
export function generatePkcePair(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}
