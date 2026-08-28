import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    env: {
      // lib/env.ts validates DATABASE_URL at import time; tests need a
      // syntactically valid value even though no real DB is touched.
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    },
  },
});
