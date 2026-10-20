import 'server-only';
import { createHash } from 'node:crypto';
import { revalidatePath, revalidateTag, updateTag } from 'next/cache';
import { clearCatalogReads } from './catalog-flight';
import { runtimeDatabaseConfig } from './database-config';

// All public views derive from the same cached directory. One invalidation
// updates courses, faculty profiles, assignments, settings and group listings.
export const CATALOG_CACHE_TAG = 'public-catalog-v1';
export const CATALOG_REVALIDATE_SECONDS = 300;

export function catalogCacheNamespace(): string {
  // Reuse validation that reports a safe error without exposing a malformed URL.
  const database = new URL(runtimeDatabaseConfig().connectionString!);
  // Isolate projects without putting credentials in cache keys or cached values.
  return createHash('sha256')
    .update(
      JSON.stringify([
        database.hostname,
        database.port,
        database.username,
        database.pathname,
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      ]),
    )
    .digest('hex');
}

// Call only after the database transaction commits. updateTag expires immediately
// and gives the editing administrator fresh data in the action response.
export function invalidateCatalogAction(): void {
  clearCatalogReads();
  updateTag(CATALOG_CACHE_TAG);
  revalidatePath('/', 'layout');
}

// Route Handlers cannot use updateTag. expire: 0 also makes the next reader wait
// for current data, rather than returning a stale response while refreshing.
export function invalidateCatalogRoute(): void {
  clearCatalogReads();
  revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });
  revalidatePath('/', 'layout');
}
