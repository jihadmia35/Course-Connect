import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ notice: 'Original notice', reads: vi.fn() }));
vi.mock('next/cache', async () => ({ ...(await import('./helpers/next-cache')).nextCache }));
vi.mock('@/lib/db', () => ({
  db: () => ({
    faculty: {
      findMany: async (query: unknown) => {
        state.reads(query);
        return [];
      },
    },
    course: { findMany: async () => [] },
    semester: { findMany: async () => [] },
    courseSection: { findMany: async () => [] },
    department: { findMany: async () => [] },
    appSettings: { findUnique: async () => ({ notice: state.notice, submissionsEnabled: true }) },
  }),
}));
import { getCatalog, getFacultyCatalog, getAdminCatalog } from '@/lib/catalog';
import {
  CATALOG_CACHE_TAG,
  CATALOG_REVALIDATE_SECONDS,
  invalidateCatalogAction,
  invalidateCatalogRoute,
} from '@/lib/catalog-cache';
import { clearDataCache, nextCache } from './helpers/next-cache';
beforeEach(() => {
  clearDataCache();
  vi.clearAllMocks();
  state.notice = 'Original notice';
  vi.stubEnv('DATABASE_URL', 'postgresql://test:synthetic-secret@one.invalid/catalog');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://one.invalid');
});
afterEach(() => vi.unstubAllEnvs());

describe('shared public catalog cache', () => {
  it('reuses reads across requests and isolates each faculty profile from the directory', async () => {
    await getCatalog();
    await getFacultyCatalog('faculty-a');
    await getFacultyCatalog('faculty-b');
    state.notice = 'Changed after warming';
    for (let i = 0; i < 3; i++) {
      expect((await getCatalog()).notice).toBe('Original notice');
      expect((await getFacultyCatalog('faculty-a')).notice).toBe('Original notice');
      expect((await getFacultyCatalog('faculty-b')).notice).toBe('Original notice');
    }
    expect(state.reads).toHaveBeenCalledTimes(3);
    expect(nextCache.unstable_cache).toHaveBeenCalledWith(
      expect.any(Function),
      ['catalog-v1', expect.stringMatching(/^[a-f0-9]{64}$/)],
      { tags: [CATALOG_CACHE_TAG], revalidate: CATALOG_REVALIDATE_SECONDS },
    );
    expect(JSON.stringify(nextCache.unstable_cache.mock.calls)).not.toContain('synthetic-secret');
  });
  it.each([invalidateCatalogAction, invalidateCatalogRoute])(
    'expires the directory and every profile together',
    async (invalidate) => {
      await Promise.all([getCatalog(), getFacultyCatalog('a'), getFacultyCatalog('b')]);
      state.notice = 'Committed change';
      invalidate();
      for (const catalog of await Promise.all([
        getCatalog(),
        getFacultyCatalog('a'),
        getFacultyCatalog('b'),
      ]))
        expect(catalog.notice).toBe('Committed change');
      expect(state.reads).toHaveBeenCalledTimes(6);
      expect(nextCache.revalidatePath).toHaveBeenCalledWith('/', 'layout');
    },
  );
  it('keeps administrator reads fresh without exposing them through the shared cache', async () => {
    await getCatalog();
    state.notice = 'Direct SQL update';
    expect((await getAdminCatalog()).notice).toBe('Direct SQL update');
    state.notice = 'Another SQL update';
    expect((await getAdminCatalog()).notice).toBe('Another SQL update');
    expect((await getCatalog()).notice).toBe('Original notice');
    expect(state.reads).toHaveBeenCalledTimes(3);
  });
  it('isolates database projects and photo origins without cache-key credentials', async () => {
    await getCatalog();
    state.notice = 'Another database';
    vi.stubEnv('DATABASE_URL', 'postgresql://test:another-secret@two.invalid/catalog');
    expect((await getCatalog()).notice).toBe('Another database');
    state.notice = 'Another photo origin';
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://two.invalid');
    expect((await getCatalog()).notice).toBe('Another photo origin');
    expect(state.reads).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(nextCache.unstable_cache.mock.calls)).not.toMatch(
      /synthetic-secret|another-secret/,
    );
  });
  it('bypasses the shared cache for the unconfigured source preview', async () => {
    vi.stubEnv('DATABASE_URL', '');
    expect((await getCatalog()).preview).toBe(true);
    expect((await getFacultyCatalog('FZC')).sections).toHaveLength(2);
    expect(state.reads).not.toHaveBeenCalled();
    expect(nextCache.unstable_cache).not.toHaveBeenCalled();
  });
  it('does not cache a failed database read', async () => {
    state.reads.mockImplementationOnce(() => {
      throw new Error('Synthetic database outage');
    });
    await expect(getCatalog()).rejects.toThrow('Synthetic database outage');
    expect((await getCatalog()).preview).toBe(false);
    expect(state.reads).toHaveBeenCalledTimes(2);
  });
});
