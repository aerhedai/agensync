import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.url(),
  OLLAMA_BASE_URL: z.url(),
  AI_PROVIDER: z.enum(["ollama"]),
  // Optional: Gmail integration (Phase 9) isn't required for the rest of
  // the app to run, so these stay unset-able rather than failing every
  // build/test that doesn't configure Gmail.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.url().optional(),
});

export const env = envSchema.parse(process.env);
