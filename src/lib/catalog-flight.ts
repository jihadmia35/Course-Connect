import 'server-only';

// Only pending work is held in memory, never a second TTL cache. Concurrent
// misses in one warm instance share SQL work; Next owns persistent cache data.
const pending = new Map<string, Promise<unknown>>();
let revision = 0;

export function coalesceCatalogRead<T>(key: string, read: () => Promise<T>): Promise<T> {
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const startedAtRevision = revision;
  const result = Promise.resolve()
    .then(read)
    .then((value) => (startedAtRevision === revision ? value : coalesceCatalogRead(key, read)));
  pending.set(key, result);
  const cleanup = () => {
    if (pending.get(key) === result) pending.delete(key);
  };
  void result.then(cleanup, cleanup);
  return result;
}

export function clearCatalogReads(): void {
  // A read started before this commit must not publish an old result back into
  // Next's cache after invalidation. It joins/retries the current revision.
  // Its cleanup also cannot remove a newer flight.
  revision++;
  pending.clear();
}
