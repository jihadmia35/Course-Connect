import { afterEach, describe, expect, it, vi } from 'vitest';
import { runtimeDatabaseConfig } from '@/lib/database-config';

const session =
  'postgresql://postgres.test:synthetic%40password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=supabase%2Fprod-ca-2021.crt';
afterEach(() => vi.unstubAllEnvs());

describe('serverless database connection policy', () => {
  it('avoids Supavisor session exhaustion on Vercel while preserving credentials and TLS', () => {
    const config = runtimeDatabaseConfig(session, true);
    const source = new URL(session);
    const runtime = new URL(config.connectionString!);
    expect(runtime.port).toBe('6543');
    expect(config.max).toBe(5);
    expect(config.idleTimeoutMillis).toBe(5000);
    expect(runtime.hostname).toBe(source.hostname);
    expect(runtime.username).toBe(source.username);
    expect(runtime.password).toBe(source.password);
    expect(runtime.pathname).toBe(source.pathname);
    expect([...runtime.searchParams]).toEqual([...source.searchParams]);
  });
  it('keeps local and migration environment values unchanged', () => {
    vi.stubEnv('DATABASE_URL', session);
    vi.stubEnv('DIRECT_URL', session);
    vi.stubEnv('VERCEL', '1');
    expect(new URL(runtimeDatabaseConfig().connectionString!).port).toBe('6543');
    expect(process.env.DATABASE_URL).toBe(session);
    expect(process.env.DIRECT_URL).toBe(session);
    const local = runtimeDatabaseConfig(session, false);
    expect(new URL(local.connectionString!).port).toBe('5432');
    expect(local.max).toBe(5);
  });
  it('keeps an existing transaction URL on 6543', () => {
    const url = session.replace(':5432/', ':6543/');
    expect(runtimeDatabaseConfig(url, true).connectionString).toBe(url);
  });
  it.each([
    'postgresql://user:synthetic@db.example.supabase.co:5432/postgres',
    'postgresql://user:synthetic@localhost:5432/postgres?sslmode=disable',
    'postgresql://user:synthetic@db.example.com:5432/postgres',
    'postgresql://user:synthetic@pooler.supabase.com.evil.example:5432/postgres',
  ])('does not rewrite a non-Supavisor endpoint: %s', (url) => {
    expect(runtimeDatabaseConfig(url, true).connectionString).toBe(url);
  });
  it.each([undefined, '', 'invalid', 'https://database.invalid'])(
    'rejects invalid configuration without exposing its contents: %s',
    (url) => {
      vi.stubEnv('DATABASE_URL', '');
      expect(() => runtimeDatabaseConfig(url, true)).toThrow(
        /Database is not configured|valid PostgreSQL/,
      );
    },
  );
});
