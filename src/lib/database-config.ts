import 'server-only';
import type { PoolConfig } from 'pg';

export function runtimeDatabaseConfig(
  connectionString: string | undefined = process.env.DATABASE_URL,
  onVercel = process.env.VERCEL === '1',
): PoolConfig {
  if (!connectionString) throw new Error('Database is not configured. Set DATABASE_URL.');
  let url: URL;
  try {
    url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }

  // Supavisor session mode pins one database connection per client. Serverless
  // instances must share backend connections through transaction mode instead.
  // This affects application traffic only; Prisma migrations still use DIRECT_URL.
  if (onVercel && url.hostname.endsWith('.pooler.supabase.com') && url.port === '5432')
    url.port = '6543';

  return {
    connectionString: url.toString(),
    // Fluid Compute runs concurrent requests in a warm instance. A one-client
    // pool serializes every query and can time out while waiting for checkout.
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 5000,
  };
}
