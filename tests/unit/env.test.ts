import { describe, expect, it } from "vitest";

import { envSchema } from "@/lib/env";

const validEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5433/agensync",
  OLLAMA_BASE_URL: "http://ollama.test:11434",
  AI_PROVIDER: "ollama",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_dGVzdC1rZXk",
  CLERK_SECRET_KEY: "sk_test_dGVzdC1rZXk",
  TOKEN_ENCRYPTION_KEY: "VAbwbKlEAJsczJIK4qu/Or5WWwOYJ86VZJ94gwtcRHM=",
};

describe("envSchema", () => {
  it("accepts a fully valid env", () => {
    const result = envSchema.safeParse(validEnv);

    expect(result.success).toBe(true);
  });

  it("rejects a missing DATABASE_URL", () => {
    const { OLLAMA_BASE_URL, AI_PROVIDER } = validEnv;
    const result = envSchema.safeParse({ OLLAMA_BASE_URL, AI_PROVIDER });

    expect(result.success).toBe(false);
  });

  it("rejects a DATABASE_URL that isn't a valid URL", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      DATABASE_URL: "not-a-url",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing OLLAMA_BASE_URL", () => {
    const { DATABASE_URL, AI_PROVIDER } = validEnv;
    const result = envSchema.safeParse({ DATABASE_URL, AI_PROVIDER });

    expect(result.success).toBe(false);
  });

  it("rejects an unsupported AI_PROVIDER", () => {
    const result = envSchema.safeParse({ ...validEnv, AI_PROVIDER: "openai" });

    expect(result.success).toBe(false);
  });

  it("rejects a Clerk publishable key without the pk_ prefix", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "not-a-clerk-key",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a Clerk secret key without the sk_ prefix", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      CLERK_SECRET_KEY: "not-a-clerk-key",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a TOKEN_ENCRYPTION_KEY that doesn't decode to 32 bytes", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      TOKEN_ENCRYPTION_KEY: "dG9vLXNob3J0",
    });

    expect(result.success).toBe(false);
  });
});
