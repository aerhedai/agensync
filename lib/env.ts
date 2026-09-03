import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.url(),
  // Optional: Gmail integration (Phase 9) isn't required for the rest of
  // the app to run, so these stay unset-able rather than failing every
  // build/test that doesn't configure Gmail.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.url().optional(),
  // Google Drive shares the client id/secret above (one Google Cloud
  // project backs both Gmail and Drive) but calls back to its own route
  // path, so it needs its own redirect URI — same shape as the Microsoft
  // vars below.
  GOOGLE_DRIVE_REDIRECT_URI: z.url().optional(),
  // Optional: Slack integration (notify_channel), same treatment as the
  // Google vars above — the rest of the app runs fine without these, only
  // /settings' "Add Slack account" flow needs them.
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_REDIRECT_URI: z.url().optional(),
  // Optional: Microsoft integrations (Outlook Mail, Teams, Outlook
  // Calendar) — one Azure AD app registration backs all three (shared
  // client id/secret, like one Google Cloud project backs Gmail), but each
  // product calls back to its own route path
  // (/api/integrations/{outlook,teams,outlook-calendar}/callback), so each
  // needs its own registered redirect URI.
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_OUTLOOK_REDIRECT_URI: z.url().optional(),
  MICROSOFT_TEAMS_REDIRECT_URI: z.url().optional(),
  MICROSOFT_CALENDAR_REDIRECT_URI: z.url().optional(),
  MICROSOFT_SHAREPOINT_REDIRECT_URI: z.url().optional(),
  // Optional: used to build absolute links back into the app (e.g. a
  // notify_channel message linking to /approvals) — nothing breaks without
  // it, the link is just omitted. Not derived from the request the way
  // OAuth callback routes derive their own base URL, since a pipeline has
  // no request to derive it from.
  NEXT_PUBLIC_APP_URL: z.url().optional(),
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
