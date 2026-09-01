import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.url(),
  OLLAMA_BASE_URL: z.url(),
  AI_PROVIDER: z.enum(["ollama"]),
  // Optional: only set in hosted environments (Preview/Production), where
  // OLLAMA_BASE_URL points at scripts/ollama-auth-proxy.py's public
  // Tailscale Funnel URL rather than Ollama directly — see
  // docs/production-notes.md. Local dev talks to Ollama directly and
  // leaves this unset.
  OLLAMA_PROXY_SECRET: z.string().optional(),
  // Optional: Gmail integration (Phase 9) isn't required for the rest of
  // the app to run, so these stay unset-able rather than failing every
  // build/test that doesn't configure Gmail.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.url().optional(),
  // Optional: Slack integration (notify_slack), same treatment as the
  // Google vars above — the rest of the app runs fine without these, only
  // /settings' "Add Slack account" flow needs them.
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_REDIRECT_URI: z.url().optional(),
  // Required: every page/action resolves org context through Clerk now
  // (lib/organisations/current-organisation.ts) — there's no working app
  // without these, unlike the opt-in Gmail vars above.
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().regex(/^pk_(test|live)_/),
  CLERK_SECRET_KEY: z.string().regex(/^sk_(test|live)_/),
  // Base64-encoded, must decode to exactly 32 bytes (AES-256). Generate
  // with: openssl rand -base64 32
  TOKEN_ENCRYPTION_KEY: z.string().refine(
    (value) => {
      try {
        return Buffer.from(value, "base64").length === 32;
      } catch {
        return false;
      }
    },
    { message: "TOKEN_ENCRYPTION_KEY must be base64 and decode to 32 bytes" },
  ),
});

export const env = envSchema.parse(process.env);
