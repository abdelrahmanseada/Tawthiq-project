import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";

/**
 * Single Prisma client per process. In development Next.js hot-reloads modules,
 * so the instance is cached on globalThis to avoid exhausting DB connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
