import { PrismaClient } from "@/generated/prisma-v9";

const globalForPrisma = globalThis as unknown as { financialPrismaV10?: PrismaClient };

export const prisma = globalForPrisma.financialPrismaV10 ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.financialPrismaV10 = prisma;
