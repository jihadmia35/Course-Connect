# SEU Course Connect

A complete Next.js App Router application for Southeast University course sections and student-shared Messenger invites. It includes a responsive student portal, protected administration, Supabase Auth and Storage integration, PostgreSQL/Prisma migrations, and an idempotent UMS HTML importer.

The homepage is an instant class-group finder: type `CSE361.9` and join directly from the result. Courses expand their sections inline; sharing preselects the class. Browser-local bookmarks provide saved sections without an account. Desktop sidebar navigation becomes a bottom navigation on phones. The warm neutral and deep green design uses self-hosted DM Sans and Manrope. See [the interaction design](docs/DESIGN.md).

**Connection status:** The supplied Supabase database connection is configured in the ignored local `.env` file and has been verified with TLS certificate and hostname validation. The supplied Fall - 2026 advising data is loaded in the live database: 69 courses, 122 faculty, 496 sections, and 796 distinct meetings. Supabase API keys are configured locally, and the requested administrator account and role mapping have been created and verified through Supabase Auth. Faculty Storage bucket verification and a Vercel deployment remain pending. Without `DATABASE_URL`, public pages display a **read-only source snapshot**. The owner confirmed **Fall - 2026** as the source semester. No fabricated photos, departments, or group URLs are included. Writes require the real services.

## Run locally

Use Node.js 22.12 or newer on the 22 line (the implementation was tested with 22.23.1).

```bash
npm ci
cp .env.example .env
npm run dev
```

Open [localhost:3000](http://localhost:3000). You can browse the supplied source immediately without credentials. Set environment values in `.env` for the application and Prisma CLI. Never commit secrets. Next.js also supports `.env.local`, but the CLI scripts explicitly load `.env`.

## Connect Supabase

1. Create a Supabase project. Copy its URL and publishable key into `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. Set `DATABASE_URL` to the transaction pooler URL from the dashboard (usually port 6543). Set `DIRECT_URL` to the direct connection or session pooler URL (5432) for migrations. Use the dashboard-provided host and username; encode password special characters. The included public CA at `supabase/prod-ca-2021.crt` supports `sslmode=verify-full&sslrootcert=supabase%2Fprod-ca-2021.crt`; Next.js includes it in deployment tracing. The supplied local configuration uses the provided session pooler (5432) for both runtime and migrations. The Prisma 7 driver adapter uses `pg` pooling with a maximum of five connections per application process. Choose the appropriate verified TLS configuration for your project; do not disable certificate verification.
3. Generate a random `RATE_LIMIT_SECRET` of at least 32 bytes. `APP_URL` is optional: omit it on Vercel (including its free `vercel.app` domains and previews) and localhost. Public writes must match the origin serving the request. Set `APP_URL` only if a custom reverse proxy needs an explicit canonical origin, without a trailing slash. The secret signs form challenges and hashes client rate-limit identifiers. It is required for production public writes.
4. Apply migrations:

   ```bash
   npm run db:generate
   npm run db:validate
   npm run db:deploy
   ```

5. Run `supabase/storage.sql` in the Supabase SQL editor to create the public `faculty-photos` bucket. Set `SUPABASE_SECRET_KEY` on the server to enable uploads. Uploads are admin-only, limited to JPEG/PNG/WebP up to 2 MB, decoded with an input pixel limit, stripped of metadata, cropped, and re-encoded as WebP. No browser storage write policy is needed.
6. Create an administrator account in **Supabase Auth → Users**. Use email/password authentication and disable public sign-up if it is not needed. Configure the project’s Auth Site URL to your application origin. Authentication is password-based, so no OAuth callback route is required.
7. Set `ADMIN_USER_ID` to that existing Auth user’s UUID and run:

   ```bash
   npm run admin:grant
   ```

8. Sign in at `/login`. Create **Fall - 2026** in `/admin/semesters`, then import the original saved HTML at `/admin/imports`. The owner confirmed Fall - 2026; the source itself has no semester label.

Database tables enable RLS and revoke `anon`/`authenticated` access. Browser clients access data through the application server. The Prisma connection uses a trusted server database role that owns the tables or has the required privileges and RLS bypass; never use an anonymous Supabase key as a database credential. The server verifies the authenticated user through Supabase and checks `AdminUser` for **every** privileged action. It does not trust client metadata or a browser-provided admin flag.

## Import source data

The entire supplied HTML was inspected as data. It is a saved Angular page with rendered `<div class="ums-grid-offered-section">` rows, not an HTML table. No scripts, external assets, or remote resources are executed or fetched by the importer.

- 69 courses, 496 unique sections, 122 named faculty, 805 listed class meetings (796 distinct).
- 13 sections have no faculty assignment. All section rows have at least one parsed meeting.
- The HTML has no semester label; the owner confirmed **Fall - 2026**. Faculty departments, department records, and faculty photos are absent.
- Personal account details, advised-section history, personalized grades/retake annotations, and unrelated UMS features are excluded.
- The remaining offered-section note is retained privately as `sourceNote`; it is not displayed publicly.

Analyze a saved HTML file without connecting a database:

```bash
npm run data:analyze -- "/path/to/UMS - naim.html"
# Compare every source field against the imported database:
npm run data:verify -- "/path/to/UMS - naim.html"
```

Import from the CLI after granting an admin mapping:

```bash
# IMPORT_SEMESTER defaults to the owner-confirmed Fall - 2026 in .env.example.
npm run db:seed -- "/path/to/UMS - naim.html"
```

For initial setup with trusted database-owner credentials, use the audited database-operator mode. This does not create an administrator account or bypass web authorization:

```bash
npm run db:seed -- --database-operator --activate "/path/to/UMS - naim.html"
```

`--database-operator` records the actual PostgreSQL session role in import history instead of an Auth UUID. `--activate` makes the selected semester the default. Keep these flags in the trusted CLI; web imports always require a verified administrator.

Without a path, `db:seed` uses `tests/fixtures/advising.html`, a sanitized copy of the real offered rows with personal UI removed. `IMPORT_SEMESTER` is always required. Normal CLI imports also require `ADMIN_USER_ID`; database-operator imports require trusted database credentials instead.

Imports report **inserted, updated, skipped, invalid**, with row-level issues. Counts refer to section rows. Courses and faculty are upserted globally; sections are unique within semester/course/number. Exact duplicate input rows are skipped; conflicting duplicate section rows are excluded and reported. Repeating an unchanged import creates no directory duplicates. Updates replace a matched section’s faculty and meetings, preserve its group links, and leave sections absent from the file untouched. The semester is locked during the atomic transaction. Import history preserves file checksum, attribution, summary, and time, without retaining the original HTML.

Administrators can edit data manually. Reimporting a section replaces manual faculty/meeting edits with the new source values; inspect the selected semester before importing. Missing department/photo data is never guessed. See [source analysis](docs/SOURCE_ANALYSIS.md).

## Portal and administration

Public routes:

| Route                         | Purpose                                          |
| ----------------------------- | ------------------------------------------------ |
| `/`                           | Directory overview and navigation                |
| `/faculty`, `/faculty/[id]`   | Search faculty; browse assigned courses/sections |
| `/courses`, `/courses/[id]`   | Search courses; select semester and sections     |
| `/sections`, `/sections/[id]` | Class meetings, classrooms, group invites        |
| `/submit`                     | Anonymous group submission                       |
| `/about`                      | Source provenance and privacy                    |

Admin routes under `/admin` cover overview, faculty/photos, courses, departments, semesters, sections/schedules, groups, reports, imports/history, and settings. Forms provide validation, confirmation before deletion, pending states, and notifications. Foreign keys prevent deleting referenced courses, faculty assignments, semesters, and sections with groups. Department removal clears optional assignments. Removing a group intentionally removes its associated reports. A section with groups cannot be moved to another course/semester or renumbered.

Semester-specific course/section counts are derived from teaching assignments. Multiple faculty and meetings are supported per section. Times use Asia/Dhaka. A course prefix filter is labeled **course area**, not department, because the source does not establish department membership.

## Messenger and abuse controls

Only these explicit HTTPS invite formats are supported:

```text
https://m.me/j/<6–256 character token>
https://messenger.com/join/<6–256 character token>
```

Tokens use ASCII letters, digits, `_`, and `-`. Optional `www`, a trailing slash, and known tracking parameters (`utm_*`, `fbclid`, `mibextid`, `send_source`) normalize away. Tokens remain case-sensitive. Unknown query parameters, credentials, nonstandard ports, fragments, unrelated hosts, profile URLs, and other formats are rejected. Different hosts are not assumed equivalent. Adjust the tested allowlist deliberately if Meta introduces a new format.

The server locks the section, checks its course and semester, checks existing normalized invites, and saves atomically. An existing distinct group causes a warning and returns existing join links. **Submit Anyway** repeats all server checks and permits a distinct URL. A database unique constraint prevents normalized duplicates within the same section, including racing requests. There are no rankings, votes, member counts, scraping, or primary-group fields.

Public submissions and reports require a same-origin JSON POST, server validation, an expiring HMAC form challenge with a two-second minimum delay, a honeypot, and persistent atomic database rate limiting. Limits per 15 minutes: 8 group attempts, 5 reports, 10 sign-in attempts. Vercel’s trusted forwarded client address is hashed with the server secret. Outside Vercel, a shared bucket is used deliberately until a trusted proxy integration is implemented. Never trust arbitrary client-supplied forwarding headers. These are MVP abuse controls; configure platform firewall/bot protection if traffic warrants it. The app does not claim these controls eliminate all spam.

## Validate

```bash
npm run typecheck
npm run lint
npm test
npm run db:verify
npm run build
PLAYWRIGHT_BROWSERS_PATH=/tmp/seu-playwright npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/seu-playwright npm run test:e2e
PLAYWRIGHT_BROWSERS_PATH=/tmp/seu-playwright npm run test:e2e:db
```

`npm test` runs parser, validation, actual server authorization, and integration tests. Integration tests boot an ephemeral **PGlite PostgreSQL WASM engine**, apply the committed SQL, and use the real Prisma `pg` adapter through a local socket. No Supabase credentials or production database is used. They cover relationships, import idempotency and updates, duplicate links, warning/Submit Anyway, semester isolation, safe deletion, paused submissions, and RLS. PGlite is only a test dependency. Its connection model is not equivalent to production multi-session PostgreSQL; stage concurrency/load tests against Supabase before a public launch.

`db:verify` runs the actual Prisma `migrate deploy` CLI twice against a fresh temporary PostgreSQL-compatible engine and checks `migrate status`. Browser tests cover real navigation, profiles, sections, search, empty states, disabled preview submissions, admin redirects, mobile navigation, and layout overflow. Tests that require live Supabase Auth/Storage must be completed with your project credentials. `test:e2e:db` also exercises actual browser-to-Route-Handler-to-Prisma writes against a disposable database: first invite, warning, Submit Anyway, normalized duplicate rejection, reporting, and the rate limit. These invites are synthetic local test data; no request is sent to Messenger. Admin integration tests exercise real CRUD persistence with a test-only authenticated identity; separate authorization tests cover the real role-checking code. No external-service verification is implied by passing local tests.

For an enforced read-only inspection of existing Supabase data/configuration, run `npm run check:deployment`. It does not run migrations, import data, sign in, or create the Storage bucket. See the current [pre-deployment audit](docs/PRE_DEPLOYMENT_AUDIT.md).

See [deployment](docs/DEPLOYMENT.md), [architecture](docs/ARCHITECTURE.md), and [verification results](docs/VERIFICATION.md).

## Reference documentation

- [Prisma 7 PostgreSQL connection configuration](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)
- [Supabase server-side clients and validated sessions](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase API key types](https://supabase.com/docs/guides/getting-started/api-keys)

## Toolchain audit

The production dependency audit reported **zero vulnerabilities** on 19 October 2026. The development-only ESLint dependency chain reports five high-severity entries rooted in the `braces` nested-pattern denial-of-service advisory (GHSA-vfj7-8cjw-p6xm). No compatible upstream fix was available in the installed current Next.js lint configuration; npm's force suggestion would downgrade the framework lint configuration. This chain is not used by the running application. Lint only trusted repository globs, and update the toolchain when a compatible patch is published. The application does not silently force an incompatible downgrade.
