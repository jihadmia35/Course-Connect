import 'server-only';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { runtimeDatabaseConfig } from './database-config';
const globalDb = globalThis as unknown as { db?: PrismaClient };
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('Database is not configured. Set DATABASE_URL.');
  if (!globalDb.db) {
    const pool = new Pool(runtimeDatabaseConfig());
    if (process.env.VERCEL === '1') attachDatabasePool(pool);
    globalDb.db = new PrismaClient({
      adapter: new PrismaPg(pool, { disposeExternalPool: true }),
    });
  }
  return globalDb.db;
}
