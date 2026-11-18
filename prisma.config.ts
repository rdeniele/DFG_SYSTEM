import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 doesn't load env files by itself. Use the same .env.local as Next.js.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Supabase → Connect → "Session pooler" connection string (port 5432), with your DB password.
    url: process.env.DATABASE_URL ?? "",
  },
});
