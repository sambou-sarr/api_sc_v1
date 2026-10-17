import { defineConfig } from "prisma/config";
import "dotenv/config";
import { env } from "./src/config/env.js";
export default defineConfig({
  schema: "./src/database/prisma/schema.prisma",
  migrations: {
    path: "./src/database/prisma/migrations",
    seed: "./src/scripts/seed.ts",
  },
  datasource: {
    url: env?.DATABASE_URL!,
  },
});
