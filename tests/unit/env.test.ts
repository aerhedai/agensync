import { describe, expect, it } from "vitest";

import { envSchema } from "@/lib/env";

describe("envSchema", () => {
  it("accepts a valid DATABASE_URL", () => {
    const result = envSchema.safeParse({
      DATABASE_URL: "postgresql://user:pass@localhost:5433/agensync",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a missing DATABASE_URL", () => {
    const result = envSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects a DATABASE_URL that isn't a valid URL", () => {
    const result = envSchema.safeParse({ DATABASE_URL: "not-a-url" });

    expect(result.success).toBe(false);
  });
});
