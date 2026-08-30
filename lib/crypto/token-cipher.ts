import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

// AES-256-GCM via Node's built-in node:crypto — no new dependency needed.
// Encrypts Integration.accessToken/refreshToken at rest (see
// lib/integrations/integration-repository.ts, the only place these
// functions are called). Key: TOKEN_ENCRYPTION_KEY, base64, 32 bytes
// (validated in lib/env.ts), loaded once at module scope.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const FORMAT_VERSION = "v1";

const key = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64");

/**
 * On-disk format: "v1:<base64 iv>:<base64 authTag>:<base64 ciphertext>" —
 * versioned and colon-delimited so a future algorithm/key change is a
 * parseable evolution rather than a silent format collision, and each
 * segment is independently inspectable (e.g. in psql) without decrypting.
 */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    FORMAT_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Throws if the ciphertext was tampered with or the key is wrong — GCM's
 * auth tag check is a real integrity signal here, not a footgun.
 */
export function decryptToken(stored: string): string {
  const [version, ivB64, authTagB64, ciphertextB64] = stored.split(":");
  if (version !== FORMAT_VERSION || !ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error(`Unrecognized token ciphertext format: "${version}"`);
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
