# Vercel + Supabase deployment

The current project was audited on 20 October 2026. Read [PRE_DEPLOYMENT_AUDIT.md](PRE_DEPLOYMENT_AUDIT.md) for passed checks, the remaining production setup items, and the no-live-write testing boundary. The existing advising data and all three live migrations already match; there is no need to recreate, re-import, or reapply them to deploy this version.

## Prepare the database

For a new Supabase project, follow the README to configure Auth, create the photo bucket, grant an admin, and import into the confirmed semester. For the existing project, only complete the setup items in the audit; its data and admin mapping already exist. Use the dashboard's correct pooler connection string for your region/project. Use the transaction pooler (6543) for Vercel runtime traffic. Prefer the direct URL or session pooler (5432) for the Prisma migration CLI. The runtime shares a pool of up to five connections per warm instance, registered with Vercel’s official `attachDatabasePool` lifecycle helper. Idle connections time out after five seconds. For compatibility with an existing session-pooler environment value, the app automatically switches Supabase `*.pooler.supabase.com:5432` to port `6543` on Vercel, preserving credentials and TLS options. This does not alter `DIRECT_URL` or the stored environment value.

Run `npm ci`, `npm run db:validate`, and `npm run db:deploy` against the intended project in a trusted terminal or release job. Apply the committed migrations once before the first app release; do not use `db push` as a production migration strategy. Back up existing databases before subsequent schema changes. Read SQL changes before applying them. RLS/revocation SQL is included in migrations. Run `supabase/storage.sql` separately in the project SQL editor.

The runtime database role must have the required server-side privileges. With the default Supabase Postgres connection, it owns the migrated tables. Do not expose that credential in a public environment variable. App tables have no anonymous/authenticated Data API policies; all reads/writes go through Next.js. Keep the dedicated storage bucket free of broad public write policies.

## Deploy the application

1. Push the source to your repository and import it into Vercel as a Next.js project. Use Node.js 22.x (at least 22.12).
2. Set production environment values from `.env.example`: `DATABASE_URL`, `DIRECT_URL` for release migrations if run there, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` if using photos, `RATE_LIMIT_SECRET`. Omit `APP_URL` on Vercel; the free production domain, deployment/branch previews, and assigned custom domains use the serving request origin automatically. CLI-only `ADMIN_USER_ID` and `IMPORT_SEMESTER` do not need to be deployed.
3. Use `npm ci --include=dev` as install and `npm run build` as build. The Node engine is pinned to `^22.12.0` to stay on the tested Node 22 major. Build-time development dependencies include Prisma and TypeScript; do not omit them during installation. `prisma generate` is part of both postinstall and build. Never run schema-changing `migrate dev` in a build hook.
4. Deploy. Add the canonical domain to Supabase Auth Site URL and configure allowed URLs if you later add callback-based authentication. No `APP_URL` setting is needed. Preview deployments should use staging Supabase configuration if they accept writes. An explicit `APP_URL` remains an optional override for a custom reverse proxy; do not copy a localhost value to Vercel.
5. Complete the live-service checklist below. Invite students only after a real semester is selected and the intended source imported.

The committed `vercel.json` selects Singapore (`sin1`) because the supplied Supabase endpoint is in `ap-southeast-1`. Confirm the new deployment's Functions use this region; update the file if you move the database. Public directory results now use shared server caching and expire after successful app writes. New visitors use the same server cache as returning visitors. See [caching and freshness](CACHING.md) for invalidation, open-tab refresh behavior, and out-of-band SQL/CLI changes. Applying these changes requires a source redeployment, with no schema migration or data import.

Imports may take longer than ordinary page requests. Use a Vercel function duration compatible with your plan for `/admin/[entity]` (the route declares `maxDuration = 120`). The web importer limits files to 3 MB so multipart overhead stays below Vercel's request payload cap. The CLI parser supports 5 MB documents and can be used from a trusted workstation for larger saved pages. The supplied original is about 1.84 MB. Photo uploads stay under 2 MB input.

## Live-service acceptance checks

These require the owner's credentials and are not claimed as completed by local verification:

- Sign in with a real Supabase admin; verify a non-admin cannot access a protected page or execute a privileged action. Revoke the mapping and verify writes stop.
- Create a semester and run the original HTML import twice. Expect 496 inserted rows on the first clean import and 496 skipped on the second, assuming the exact supplied file and no subsequent changes.
- Confirm a section's faculty, day, times, and room against UMS. All times are Asia/Dhaka.
- Share a real invite, trigger the existing-group warning with another distinct invite, use Submit Anyway, then test an equivalent duplicate URL.
- Submit a report, resolve it, and remove a broken group. Confirm public pages refresh.
- Upload and replace an authorized faculty photo; confirm public read works and direct unauthenticated writes to the bucket are denied.
- Confirm directory tables cannot be selected/inserted through the Supabase anonymous Data API.
- Test rate limiting across more than one Vercel instance and concurrent submissions against real multi-session PostgreSQL. PGlite does not substitute for production concurrency verification.
- Review database pool utilization, error monitoring, TLS, backups, and hosting limits for expected traffic.

## Ten-day spam protection

This release blocks group submissions for ten days on the third submission of the same normalized invite by the same hashed network address within ten days. Initial success counts; warning plus Submit Anyway consumes two attempts. Equivalent formats and resolved shorteners count together. The response shows when submission becomes available again in Bangladesh time. It does not prevent browsing/joining or reports, and no new migration is required.

By default, counters and bans use the existing PostgreSQL `RateLimitBucket` table. Repeated denied requests skip SQL in a warm instance, but a new Vercel instance must read the ban once. For banned requests to avoid PostgreSQL across instances, connect an Upstash Redis database and add both **server-only** environment variables to Vercel, then redeploy:

```dotenv
UPSTASH_REDIS_REST_URL="https://your-database.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-standard-rest-token"
```

Get these from the Redis console's REST connection details ([official instructions](https://upstash.com/docs/redis/features/restapi#get-started)). Use the standard writable token, and never prefix these variables with `NEXT_PUBLIC_` or paste credentials into source code. The integration uses HTTP with a three-second timeout and atomic Lua counters, without a persistent Redis socket. The ordinary eight-attempt/fifteen-minute limiter still runs for allowed submissions. Do not configure only one value: incomplete configuration or an unavailable Redis service returns a safe 503 instead of allowing submissions without protection.

Keep the selected backend and `RATE_LIMIT_SECRET` stable across deployments. Redis and PostgreSQL do not automatically copy counters/bans between them; migrating a live installation requires transferring active state separately. A hashed-IP block can affect students sharing a campus/mobile network; it is not reliable person identification. This update does not provision Redis or change any live database data.

In staging, submit a synthetic invite twice, then repeat an equivalent format a third time. Verify HTTP 429, `Retry-After`, Bangladesh-time expiry, no extra group row, rejection of a different invite after the ban, and continued public browsing/reporting. Check a second instance to verify shared persistence. Do not perform this acceptance check on a shared production campus address.

## Operations

Use Supabase backups and migration history for recovery. Review reports in `/admin/reports`, preserve import audit entries, and monitor rate-limit spikes. Old rate-limit buckets may be removed after expiry by trusted maintenance SQL. Revoke admin access with a trusted database deletion from `AdminUser`; there is intentionally no public admin-grant endpoint.

The app is prepared for Vercel; it has not been published or connected to a university-owned system. No deployment credentials were supplied.

## EMAXCONNSESSION after deployment

`max clients reached in session mode ... pool_size: 15` means the Supabase session pool has been exhausted. Several Vercel instances with five local connections each can reach this limit even while pages are only being prefetched.

Deploy the current fix: Vercel app traffic uses the Supabase transaction pooler and a bounded five-connection local pool with lifecycle cleanup. Do not return to session mode or reduce the local pool to one connection; concurrent Fluid Compute requests can queue behind that single connection. Alternatively, for immediate recovery on the older build, change only the pooler port from `5432` to `6543` in Vercel's `DATABASE_URL`, keeping the username, percent-encoded password, database, and TLS query parameters unchanged, then redeploy. Keep `DIRECT_URL` on the migration/session endpoint. No schema change, import, password reset, or database restart is needed.

This matches [Supabase's connection-limit guidance](https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting#max-client-connections-reached). The fix does not disable TLS or certificate verification. A streamed Next.js page can return HTTP 200 while a data request fails and renders the error boundary; inspect runtime logs rather than relying on the status alone.

## Faculty profile connection timeouts

`timeout exceeded when trying to connect` is the `pg-pool` checkout timeout: a query waited for an available client in the local pool. The earlier one-client configuration can produce this under concurrent Vercel requests. This is distinct from Supavisor’s session-mode `max clients reached` error.

Deploy the current source to get the five-client shared pool and `attachDatabasePool` cleanup. Transaction mode on port 6543 remains required for Supabase serverless traffic. The profile route now filters courses, sections, and teachers at the database; directory counts derive from already-loaded sections. Data links do not prefetch database-backed pages on hover or as cards enter view. A clicked profile shows an opening indicator, then a route loading state, with retry/reload controls if loading fails.

The faculty profile’s Change class selector is scoped to that faculty’s assignments across semesters. The global Share a group page still offers the whole directory. No data, settings, import, migration, or database restart is required for this update. After redeployment, check the affected profiles and Vercel logs under real traffic; local tests do not establish the hosted database’s capacity.
