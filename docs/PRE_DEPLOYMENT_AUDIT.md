# Vercel readiness audit — 20 October 2026

The application passes local build and functional checks. Complete the production environment configuration below before release. Following the owner’s request, `APP_URL` is now optional and automatic same-origin validation is regression-tested; it is no longer a Vercel setup requirement. This audit did not deploy the application or mutate the live database, Auth users, or Storage configuration.

## Results

| Check                                                           | Result                                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Clean `npm ci`, including Prisma postinstall generation         | Passed in a temporary source copy with local environment files excluded                                                                                |
| Final production build                                          | Passed without Supabase credentials or a live database connection                                                                                      |
| Strict TypeScript, ESLint, formatting, Prisma schema validation | Passed                                                                                                                                                 |
| Unit/integration/security tests                                 | 86 passed in 9 files, including the automatic-origin regressions                                                                                       |
| Desktop/mobile browser suite                                    | 18 passed; 4 intentionally skipped duplicate/inapplicable viewport cases                                                                               |
| Real browser submission workflow                                | Passed against a disposable PostgreSQL-compatible database                                                                                             |
| Migration workflow                                              | All 3 migrations applied locally; repeat deploy had no pending changes; status up to date                                                              |
| Live migration inspection                                       | All 3 applied migration checksums match the source files; no migration was run against Supabase                                                        |
| Original advising source comparison                             | All 496 sections match, including titles, credits, available seats, notes, faculty assignments, meetings, and rooms                                    |
| Browser database privileges                                     | RLS enabled on all 13 app tables; no anon/authenticated table privileges or app Data API policies; no invalid indexes                                  |
| Anonymous live Data API requests                                | Faculty, CourseSection, MessengerGroupLink, and AdminUser reads rejected with HTTP 401 / PostgreSQL 42501                                              |
| Supabase public Auth configuration                              | Reachable; existing admin mapping points to a confirmed Auth user                                                                                      |
| Transaction pooler                                              | TLS and read-only PostgreSQL/Prisma relationship queries passed on port 6543                                                                           |
| Server file tracing                                             | All 19 application traces include the TLS CA; largest traced dependency set about 55 MiB; test database engine absent                                  |
| Credentials                                                     | No configured database URL/password, privileged API key, or rate-limit secret found in scanned browser assets/source; `.env` is ignored and owner-only |
| Dependency audit                                                | 0 production vulnerabilities; 5 development-only high advisories in the existing ESLint/fast-glob/braces chain                                         |

Automatic-origin tests cover free Vercel production and preview domains, localhost, internal Next.js bind addresses, explicit HTTPS ports, malformed hosts, unrelated origins, missing Origin headers, and the optional canonical override.

The added tests exercise image re-encoding and replacement, cleanup after persistence failure, upload rejection, authorization before service access, corrupted/spoofed/oversize images, cross-origin requests, honeypots, invalid/expired/tampered challenges, unsafe URLs, JSON/body-size boundaries, rate-limit denial, and secret-free public errors. Storage is mocked in these tests; they do not imply that the missing live photo bucket works.

The disposable database workflow covers anonymous first submission, the existing-group warning, Submit Anyway, normalized duplicates, reporting, and HTTP 429. No synthetic test records were inserted into Supabase.

## Required production configuration

| Item                          | Current observation                      | Before deployment                                                                                                                                                                                  |
| ----------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                     | Removed from local environment; optional | Omit on Vercel, including its free domain. The request origin is used automatically; unrelated origins are still rejected. An explicit canonical origin is supported for custom reverse proxies.   |
| `DATABASE_URL`                | Verified TLS, session pooler on 5432     | Use the dashboard-provided transaction pooler URL on 6543 for Vercel. Preserve URL-encoded credentials and `sslmode=verify-full` / `sslrootcert` options. The endpoint was verified read-only.     |
| `DIRECT_URL`                  | Session/direct migration connection      | Keep the migration connection on 5432 in the trusted release environment. It is unnecessary for the normal Vercel build. Existing migrations already match; do not re-import or recreate data.     |
| `faculty-photos` bucket       | Missing                                  | Photo upload is blocked until the owner applies `supabase/storage.sql`. This changes Storage database configuration and was intentionally not executed. Browsing works with initials placeholders. |
| Vercel environment values     | Present only in ignored local `.env`     | Copy the required values from `.env.example` into Vercel Production settings. Both public Supabase variables must be present at build time. Keep privileged values server-only.                    |
| Supabase Auth domain settings | Not changed by the audit                 | Set Site URL to the deployed origin and allowed redirect URLs as needed. No new login/session was created during this audit.                                                                       |

Supabase recommends transaction pooling for serverless applications and separating migration connections. See [Supabase Prisma troubleshooting](https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting).

The Node engine is now pinned to `^22.12.0`, matching the tested Node 22 line. Vercel can choose a newer major for an open-ended `>=22` engine range; the pin removes that ambiguity. Use the Next.js preset, install with `npm ci --include=dev`, and build with `npm run build`. Do not omit build-time development dependencies such as Prisma/TypeScript, and do not put migration/import/admin-grant commands in the build hook. See [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) and [Prisma on Vercel](https://www.prisma.io/docs/orm/v7/prisma-client/deployment/serverless/deploy-to-vercel).

The web importer accepts at most 3 MiB and photo input at most 2 MiB, below Vercel's documented 4.5 MB function payload limit with room for multipart overhead. Application traces are below the documented 250 MB standard function limit. Actual deployment bundling and hosting-plan settings remain Vercel checks. See [Vercel function limits](https://vercel.com/docs/functions/limitations).

## Read-only scope and limits

Live SQL inspection used `BEGIN ... READ ONLY`, verified `transaction_read_only=on`, and ended with rollback. Public browser smoke checks blocked non-GET/HEAD requests. No sign-in, migration, import, CRUD action, group submission, report, or upload was performed against the live project.

Before/after fingerprints confirmed Auth-user state was unchanged and the advising source still matched. The MessengerGroupLink and RateLimitBucket fingerprints changed during the audit window, indicating concurrent application activity; this audit cannot claim the entire database remained unchanged. All audit mutation tests were isolated from the live project.

Live password authentication, photo delivery/replacement, authenticated Data API behavior, concurrent write races, distributed rate limits, cold-start behavior, real devices, backups, and Vercel production routing need a staging environment or an owner-approved post-deployment test. The current no-live-write instruction intentionally excludes those write tests. An older session verified real administrator sign-in; that was not repeated here.

The 5 development advisories were not force-fixed: npm proposes a breaking framework-lint downgrade. They do not appear in the production-only audit. See the README's toolchain note.

## Repeat the read-only check

```bash
npm run check:deployment
# Optional comparison with the exact original file and a local redacted report:
npm run check:deployment -- --source '/path/to/advising.html' --output /tmp/seu-readiness.json
```

This command performs SELECT/SHOW operations inside a read-only transaction. Its output contains status/counts rather than credentials. It does not create a photo bucket, run migrations, import data, or create administrator accounts. Warnings require review even if the command has no hard blockers.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the complete deployment guide.
