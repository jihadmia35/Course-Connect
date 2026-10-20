import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCatalogReads, coalesceCatalogRead } from '@/lib/catalog-flight';
beforeEach(clearCatalogReads);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
describe('concurrent cold catalog reads', () => {
  it('performs one SQL load for a burst of identical cache misses', async () => {
    const gate = deferred<string>();
    const read = vi.fn(() => gate.promise);
    const requests = Array.from({ length: 50 }, () => coalesceCatalogRead('directory', read));
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
    gate.resolve('catalog');
    expect(await Promise.all(requests)).toEqual(Array(50).fill('catalog'));
    await coalesceCatalogRead('directory', read);
    expect(read).toHaveBeenCalledTimes(2); // No independent persistent memory cache.
  });
  it('isolates profiles and retries after failures instead of retaining a rejected promise', async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error('Temporary SQL failure'))
      .mockResolvedValue('recovered');
    await expect(coalesceCatalogRead('a', read)).rejects.toThrow('Temporary SQL failure');
    expect(await coalesceCatalogRead('a', read)).toBe('recovered');
    expect(await coalesceCatalogRead('b', read)).toBe('recovered');
    expect(read).toHaveBeenCalledTimes(3);
  });
  it('does not publish pre-edit data or delete newer work when that old read finishes', async () => {
    const old = deferred<string>();
    const current = deferred<string>();
    const read = vi
      .fn()
      .mockImplementationOnce(() => old.promise)
      .mockImplementationOnce(() => current.promise);
    const first = coalesceCatalogRead('directory', read);
    clearCatalogReads(); // Successful mutation invalidation.
    const second = coalesceCatalogRead('directory', read);
    old.resolve('old');
    await Promise.resolve();
    await Promise.resolve();
    const third = coalesceCatalogRead('directory', read);
    current.resolve('new');
    expect(await Promise.all([first, second, third])).toEqual(['new', 'new', 'new']);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('retries an overlapping read even if no new visitor has requested fresh data yet', async () => {
    const old = deferred<string>();
    const read = vi
      .fn()
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValue('committed');
    const request = coalesceCatalogRead('directory', read);
    await Promise.resolve();
    clearCatalogReads();
    old.resolve('stale');
    expect(await request).toBe('committed');
    expect(read).toHaveBeenCalledTimes(2);
  });
});
