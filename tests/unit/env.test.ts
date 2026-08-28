import { describe, expect, it } from "vitest";

import { envSchema } from "@/lib/env";

const validEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5433/agensync",
  OLLAMA_BASE_URL: "http://ollama.test:11434",
  AI_PROVIDER: "ollama",
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
});
