# Vercel + Supabase deployment

The current project was audited on 20 October 2026. Read [PRE_DEPLOYMENT_AUDIT.md](PRE_DEPLOYMENT_AUDIT.md) for passed checks, the remaining production setup items, and the no-live-write testing boundary. The existing advising data and all three live migrations already match; there is no need to recreate, re-import, or reapply them to deploy this version.

## Prepare the database

For a new Supabase project, follow the README to configure Auth, create the photo bucket, grant an admin, and import into the confirmed semester. For the existing project, only complete the setup items in the audit; its data and admin mapping already exist. Use the dashboard's correct pooler connection string for your region/project. Use the transaction pooler (6543) for Vercel runtime traffic. Prefer the direct URL or session pooler (5432) for the Prisma migration CLI. Keep the runtime connection pool small for serverless instances.

Run `npm ci`, `npm run db:validate`, and `npm run db:deploy` against the intended project in a trusted terminal or release job. Apply the committed migrations once before the first app release; do not use `db push` as a production migration strategy. Back up existing databases before subsequent schema changes. Read SQL changes before applying them. RLS/revocation SQL is included in migrations. Run `supabase/storage.sql` separately in the project SQL editor.

The runtime database role must have the required server-side privileges. With the default Supabase Postgres connection, it owns the migrated tables. Do not expose that credential in a public environment variable. App tables have no anonymous/authenticated Data API policies; all reads/writes go through Next.js. Keep the dedicated storage bucket free of broad public write policies.

## Deploy the application

1. Push the source to your repository and import it into Vercel as a Next.js project. Use Node.js 22.x (at least 22.12).
2. Set production environment values from `.env.example`: `DATABASE_URL`, `DIRECT_URL` for release migrations if run there, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` if using photos, `RATE_LIMIT_SECRET`. Omit `APP_URL` on Vercel; the free production domain, deployment/branch previews, and assigned custom domains use the serving request origin automatically. CLI-only `ADMIN_USER_ID` and `IMPORT_SEMESTER` do not need to be deployed.
3. Use `npm ci --include=dev` as install and `npm run build` as build. The Node engine is pinned to `^22.12.0` to stay on the tested Node 22 major. Build-time development dependencies include Prisma and TypeScript; do not omit them during installation. `prisma generate` is part of both postinstall and build. Never run schema-changing `migrate dev` in a build hook.
4. Deploy. Add the canonical domain to Supabase Auth Site URL and configure allowed URLs if you later add callback-based authentication. No `APP_URL` setting is needed. Preview deployments should use staging Supabase configuration if they accept writes. An explicit `APP_URL` remains an optional override for a custom reverse proxy; do not copy a localhost value to Vercel.
5. Complete the live-service checklist below. Invite students only after a real semester is selected and the intended source imported.

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

## Operations

Use Supabase backups and migration history for recovery. Review reports in `/admin/reports`, preserve import audit entries, and monitor rate-limit spikes. Old rate-limit buckets may be removed after expiry by trusted maintenance SQL. Revoke admin access with a trusted database deletion from `AdminUser`; there is intentionally no public admin-grant endpoint.

The app is prepared for Vercel; it has not been published or connected to a university-owned system. No deployment credentials were supplied.
