import 'server-only';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const globalDb = globalThis as unknown as { db?: PrismaClient };
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('Database is not configured. Set DATABASE_URL.');
  if (!globalDb.db)
    globalDb.db = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        max: 5,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 10000,
      }),
    });
  return globalDb.db;
}
