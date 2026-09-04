import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Same convention as prisma7.config.ts: load .env.local so tests use the
// same DATABASE_URL as the rest of the app (real local Postgres, or
// whatever CI sets — this silently no-ops if the file doesn't exist).
config({ path: ".env.local" });

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Clears organisations stranded by a previously failed run, so a real
    // failure is never buried under Organisation_pkey collisions in
    // unrelated files. See tests/global-setup.ts.
    globalSetup: ["tests/global-setup.ts"],
  },
});
