import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Match Next.js's env file convention (.env.local), not dotenv's .env default.
config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
