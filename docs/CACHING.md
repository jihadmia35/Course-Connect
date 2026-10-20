# Directory caching and freshness

Public directory data uses Next.js's shared Data Cache (`unstable_cache`), with request memoization to avoid repeated work in the same render. This works with the existing dynamic App Router pages without enabling Cache Components or caching authenticated HTML. No additional service, environment variable, database table, or migration is required.

The cache stores only the public catalog: courses, faculty, semester choices, assignments, meetings, groups, departments, and public settings. All public pages share the `public-catalog-v1` entry tag. Faculty profiles filter that shared catalog on the server: a new profile URL does not start a separate SQL workload, and only that faculty’s relevant data is sent to the browser. The tradeoff is that the first cold profile request fills the whole directory cache; subsequent profile requests reuse it. Keys isolate database projects and photo origins using a hash, without storing connection passwords. Preview mode bypasses the shared cache. A five-minute revalidation interval provides a fallback for changes made outside the application; time-based revalidation can return the previous value while refreshing in the background.

Concurrent misses for the catalog in one warm server process share a pending database read. Successful mutations advance a process-local revision: an overlapping read retries/joins the new revision instead of publishing its pre-edit result after invalidation. Resolved values and failures are not retained in this in-memory map. Persistent caching belongs to Next.js, so the app does not introduce another independently stale memory cache. Different Vercel instances can still perform their own first load; shared invalidation uses Next's tag APIs.

## Successful writes

Every admin create, edit, deletion, settings change, photo replacement, and web HTML import calls the same invalidator **after** its database operation or transaction commits. Server Actions use `updateTag`; public group creation uses `revalidateTag(tag, { expire: 0 })`. These expire the public data immediately, so the next request waits for fresh data. The root layout is also revalidated to clear affected route data.

An existing-group warning, an exact duplicate, a rejected submission, a failed transaction, or an unauthorized action does not flush the cache. Reports contain no public catalog changes: public reporting writes directly to the database, and administrator report screens read fresh data. Admin report edits/deletions still use the common admin invalidator.

Admin catalog screens, authentication and role checks, submission pause checks, section identity checks, duplicate checks, challenges, and rate limiting always use current data. None relies on a cached catalog to authorize a write. Photo filenames are unique and immutable; a new catalog points to the new URL. Old-object cleanup failure cannot prevent a committed photo update from expiring cached data.

## Already-open pages

The editing tab refreshes immediately after success. A storage event asks other tabs in the same browser to refresh; it contains no record or personal data. Pages also refresh on focus and once a minute while visible. Requests are throttled and postponed while an input has focus or a dialog is open, preserving forms and search state. New page requests see the expired server cache immediately; other users' already-open pages update on their next eligible refresh. This is periodic freshness, not a real-time push subscription.

Direct SQL changes and trusted CLI imports cannot call Next's in-process invalidation APIs. Prefer the admin web importer for immediate invalidation. Outside-app changes appear after the time-based revalidation completes; saving a change through the admin UI also expires all catalog entries. Changes to Auth administrator mappings take effect on the next privileged request because role checks are never shared-cached.

## Vercel connection pressure

`vercel.json` places functions in Singapore (`sin1`) to match the supplied `ap-southeast-1` Supabase endpoint. If the database moves, update this region to match it. New visitors benefit from the same shared server cache as returning visitors; the cache does not depend on a previous browser visit.

Use the dashboard-provided **transaction pooler** URL (port `6543`) for `DATABASE_URL`, and the direct/session endpoint for `DIRECT_URL` migration traffic. The current runtime automatically rewrites an existing Supabase pooler `5432` runtime URL to `6543` on Vercel. It retains TLS and uses the existing bounded five-client pool with Vercel lifecycle cleanup. Prisma 7's `pg` adapter uses these pool settings in code; legacy Prisma URL parameters such as `connection_limit` do not configure this driver pool.

Caching reduces SQL demand; it cannot repair an unavailable database or guarantee capacity for every traffic level. The first cache fill and privileged writes still need a working connection. After pushing and redeploying, inspect the new deployment's function region and logs, test from a private browser window, and review Supabase connection/CPU metrics if timeouts remain. Do not recreate the database, reimport data, or run migrations to apply this update.

See the primary references: [Next Data Cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache), [immediate Server Action invalidation](https://nextjs.org/docs/app/api-reference/functions/updateTag), [Route Handler tag invalidation](https://nextjs.org/docs/app/api-reference/functions/revalidateTag), [Vercel regions](https://vercel.com/docs/functions/configuring-functions/region), and [Supabase connection troubleshooting](https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting).
