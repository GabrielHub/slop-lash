import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma3: PrismaClient };

export const prisma = globalForPrisma.prisma3 ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma3 = prisma;
