import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  pool: vi.fn(),
  adapter: vi.fn(),
  prisma: vi.fn(),
  attach: vi.fn(),
}));
vi.mock('pg', () => ({ Pool: mocks.pool }));
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: mocks.adapter }));
vi.mock('@/generated/prisma/client', () => ({ PrismaClient: mocks.prisma }));
vi.mock('@vercel/functions', () => ({ attachDatabasePool: mocks.attach }));
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  delete (globalThis as { db?: unknown }).db;
  vi.stubEnv('DATABASE_URL', 'postgresql://test-only.invalid/postgres');
  mocks.pool.mockImplementation(function () {
    return { pool: true };
  });
  mocks.adapter.mockImplementation(function () {
    return { adapter: true };
  });
  mocks.prisma.mockImplementation(function () {
    return { client: true };
  });
});
afterEach(() => {
  delete (globalThis as { db?: unknown }).db;
  vi.unstubAllEnvs();
});
describe('Vercel database lifecycle', () => {
  it('attaches and reuses one shared pool across requests and module reloads', async () => {
    vi.stubEnv('VERCEL', '1');
    const { db } = await import('@/lib/db');
    const first = db();
    expect(db()).toBe(first);
    vi.resetModules();
    expect((await import('@/lib/db')).db()).toBe(first);
    expect(mocks.pool).toHaveBeenCalledTimes(1);
    expect(mocks.pool).toHaveBeenCalledWith(
      expect.objectContaining({ max: 5, idleTimeoutMillis: 5000 }),
    );
    expect(mocks.attach).toHaveBeenCalledExactlyOnceWith({ pool: true });
    expect(mocks.adapter).toHaveBeenCalledWith({ pool: true }, { disposeExternalPool: true });
  });
  it('does not register Vercel lifecycle hooks for local processes', async () => {
    vi.stubEnv('VERCEL', '');
    (await import('@/lib/db')).db();
    expect(mocks.attach).not.toHaveBeenCalled();
  });
});
