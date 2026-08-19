import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  // A few connections per instance: the digest and dashboard fan out with Promise.all, which
  // a max of 2 quietly serialised. Keep it small — every serverless instance holds its own
  // pool, so this multiplies across concurrency. Override with DATABASE_POOL_MAX if needed.
  const max = Number(process.env.DATABASE_POOL_MAX) || 5;
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL!,
    max,
    idleTimeoutMillis: 20000,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
