import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.url(),
  OLLAMA_BASE_URL: z.url(),
  AI_PROVIDER: z.enum(["ollama"]),
});

export const env = envSchema.parse(process.env);
