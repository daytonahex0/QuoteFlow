import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** DATABASE_URL wins; on Netlify the provisioned Netlify Database URL is used automatically. */
export function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getConnectionString } = require("@netlify/database") as typeof import("@netlify/database");
  const url = getConnectionString();
  process.env.DATABASE_URL = url;
  return url;
}

function createClient() {
  return new PrismaClient({
    datasourceUrl: databaseUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// Lazily created so builds without a database don't fail at import time.
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    globalForPrisma.prisma ??= createClient();
    const value = Reflect.get(globalForPrisma.prisma, prop);
    return typeof value === "function" ? value.bind(globalForPrisma.prisma) : value;
  },
});
