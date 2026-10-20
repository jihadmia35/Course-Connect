import { vi } from 'vitest';

// A contract double for unit/SQL integration tests outside Next's request scope.
// Production-browser tests also exercise real Next Data Cache invalidation.
const entries = new Map<string, { value: string; tags: string[] }>();
function expire(tag: string) {
  for (const [key, entry] of entries) if (entry.tags.includes(tag)) entries.delete(key);
}
export function clearDataCache() {
  entries.clear();
}
export const nextCache = {
  unstable_cache: vi.fn(
    <Args extends unknown[], Result>(
      callback: (...args: Args) => Promise<Result>,
      keys: string[] = [],
      options: { tags?: string[]; revalidate?: number } = {},
    ) =>
      async (...args: Args): Promise<Result> => {
        const key = JSON.stringify([keys, args]);
        const entry = entries.get(key);
        if (entry) return JSON.parse(entry.value) as Result;
        const value = await callback(...args);
        entries.set(key, { value: JSON.stringify(value), tags: options.tags ?? [] });
        return value;
      },
  ),
  updateTag: vi.fn(expire),
  revalidateTag: vi.fn((tag: string, profile?: unknown) => {
    void profile;
    expire(tag);
  }),
  revalidatePath: vi.fn(),
};
