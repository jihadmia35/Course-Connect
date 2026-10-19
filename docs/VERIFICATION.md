# Verification — 19 October 2026

Latest invite handling results are recorded below. The earlier [Vercel readiness audit — 20 October 2026](PRE_DEPLOYMENT_AUDIT.md) records deployment setup and previous verification. Earlier test counts below are historical.

## Mobile invites and shortened URLs — 20 October 2026

- Strict TypeScript, lint, and the isolated production build passed. The runtime dependency audit reports zero vulnerabilities.
- 164 unit/integration tests across 11 files cover supported invite aliases, canonical duplicates (including legacy stored links), admin edits/authorization, standard redirect statuses, wrappers, loops, redirect bounds, timeouts, private/reserved addresses, mixed DNS answers, and DNS pinning. Database tests use disposable PGlite instances, not Supabase.
- All 18 desktop/mobile UI regression scenarios passed; four project-specific duplicates are intentionally skipped.
- The disposable-database browser workflow passed: schemeless `www.messenger.com/j/…` submission, direct joining, Copy on cards/details, manual-copy fallback inside the existing-group warning, Submit Anyway, duplicate prevention, reporting, and rate limiting. Read-only mobile checks verify same-tab handoff, copying, selectable fallback text, and no horizontal page overflow at 390px and 320px. The database browser test used port 3003 in the isolated audit copy because a development server was already using 3001.
- A real HTTPS redirect smoke test with a public redirect test endpoint and a synthetic invite resolved to the expected canonical Messenger URL. The resolver stopped before requesting Messenger. A different redirect test service returned HTTP 403 and was correctly rejected.
- Mobile group actions, desktop actions, and the 320px manual-copy sheet were visually inspected. Native Messenger joining is not claimed to be verified: installed app versions, account state, expired invites, and device link handling can still affect it. JavaScript/interstitial-only shorteners require the original invite.
- No live database records, schema, Auth settings, or Storage were changed. No new migration is required. Deploy the updated source to apply these changes.

Environment: Node.js 22.23.1, npm 10.9.8, Next.js 16.4.2, React 19.3.1, Prisma 7.10.1, TypeScript 6.0.3, Tailwind 4.3.3. Local verification uses the supplied Fall - 2026 data. The original full test run used disposable databases. After the owner supplied database credentials, the Supabase database was connected using verified TLS and all three application migrations were deployed. Auth API keys and the administrator were subsequently configured and verified as described below. Storage delivery and Vercel deployment remain external checks.

| Check                  | Result                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`    | Passed, strict TypeScript                                                                                   |
| `npm run lint`         | Passed, no warnings                                                                                         |
| `npm run db:validate`  | Passed                                                                                                      |
| `npm test`             | 48 tests passed in 6 files                                                                                  |
| `npm run db:verify`    | All three migrations applied through Prisma CLI; second deploy had no pending migrations; status up to date |
| `npm run build`        | Production build passed, all public/admin/API routes compiled                                               |
| `npm run test:e2e`     | 8 desktop/mobile browser tests passed                                                                       |
| `npm run test:e2e:db`  | Anonymous browser flow passed against a disposable database, including rate limiting                        |
| `npm audit --omit=dev` | Zero production dependency vulnerabilities                                                                  |
| Original source parser | 496 sections, 69 courses, 122 faculty, 805 listed meetings, 796 distinct meetings, 0 invalid rows           |

## Workspace redesign — 20 October 2026

- `npm test`: 51 tests passed across 7 files, including exact section lookup, faculty/title matching, and saved/group/subject filters with semester isolation.
- `npm run test:e2e`: 15 desktop/mobile browser scenarios passed. One duplicate tablet-width scenario is intentionally skipped in the mobile project because the desktop project checks those widths explicitly.
- `npm run test:e2e:db`: anonymous direct sharing and joining, copied-invite normalization, multiple equally visible groups, duplicate warning, Submit Anyway, reports, and rate limiting passed with disposable PostgreSQL-compatible persistence.
- Production compilation, strict TypeScript, and lint passed. The refreshed preview uses the imported live catalog. Read-only browser checks cover widths from 320px to 1440px.
- Saved sections were verified across navigation and reloads; the storage is browser-local and never creates university database records.
- Public layouts, visible group actions, course expansion, mobile bottom navigation, and preselected sharing dialogs were visually inspected. Live administrator authentication was subsequently verified as described below.

## Mobile usability refinement — 20 October 2026

- Strict TypeScript, production compilation, and 51 unit/integration tests passed. Lint and formatting checks cover the modified files; generated browser output is excluded from linting.
- 18 UI browser scenarios passed: the 17-scenario phone/desktop suite plus the new visual-viewport simulation. Coverage includes filter disclosure, single-row section shortcuts, preserved sign-in values, password visibility, short-screen sheet scrolling, visible close controls, focus restoration, and direct mobile navigation.
- The separate disposable-database browser flow passed again: first invite, duplicate warning, Submit Anyway, normalized duplicates, reports, and rate limiting. No synthetic groups or reports were added to the live database.
- Read-only checks against the live application verified the real administrator login, all ten admin destinations, filtered faculty cards, and editing dialogs without saving. Public and administrative layouts were checked at 320, 390, 768, 1024, and 1440px with no horizontal page overflow or browser errors. Phone, tablet, sign-in, sharing, record-card, and short-screen screenshots were inspected.
- A reduced visual viewport was simulated in Chromium to check keyboard-aware sheet sizing and bottom-nav visibility. Actual iOS/Android software keyboards and physical device/browser combinations still need device testing; this is not a claim of physical-device verification.

## Critical workflow coverage

- Real normalized course, section, faculty, assignment, and meeting relationships; explicit `CSE361.9` → course `CSE361`, section `9` checks.
- Trusted database-operator imports use honest audit attribution while all web imports retain administrator authorization.
- First import, identical repeat import, changed schedule import, preserved group links, retained per-semester records, and detected duplicate source meetings.
- Original nested UMS DOM structure, script exclusion, duplicate/conflicting input rows, malformed meetings, unloaded pages, and oversized HTML.
- Copied Messenger invites with `send_source=gc%3Acopy_invite` submit as canonical URLs, detect normalized duplicates, and retain course/section selections after rejected submissions (browser regression reproduced before the fix and passed after it).
- Accepted Messenger formats and normalization; rejection of unsafe schemes, unrelated hosts, credentials, profile links, unexpected query parameters, fragments, ports, and escaped path attacks.
- First anonymous link, existing-group warning without persistence, Submit Anyway, equivalent duplicate rejection, database uniqueness, and correct semester/course identity.
- Actual browser → Route Handler → validation/challenge/rate limiter → Prisma → PostgreSQL writes, report submission, and HTTP 429 when the group limit is exceeded.
- Real authorization code denies anonymous users and authenticated non-admins; all admin mutation entry points deny unauthorized calls.
- Authorized admin CRUD uses a **test-only mocked authenticated identity** with real PostgreSQL persistence: departments, faculty, courses, active semester, faculty assignments, meetings, group edits, report resolution, settings, protected section identity, image type spoof rejection, and safe deletion.
- RLS enabled, no anonymous policies, denied anonymous database query, and database foreign-key protection.
- Signed form challenge timing, expiry, tampering, same-origin enforcement, and streamed request byte limits.
- Desktop/mobile navigation, faculty/profile/course/section pages, search/empty states, preview write restrictions, administrator redirects, no page errors on the overview, and no horizontal overflow at tested sizes. Screenshots were visually inspected.

## Live administrator setup — 20 October 2026

The owner supplied the project's public and server API keys in the ignored local environment file. The requested administrator was created through the Supabase Auth Admin API with the owner-specified password and a confirmed email, then its actual Auth UUID was granted the application’s `AdminUser` mapping. Password authentication and server-validated user identity succeeded.

A browser then verified the real login page, protected admin dashboard, session persistence after reload, faculty management access, logout, and the redirect back to login after logout. The local app was rebuilt and restarted with the new Auth configuration. The public key was confirmed non-privileged, and the privileged server key was absent from compiled browser assets. Passwords, session tokens, and API key values are not recorded in this report.

## Remaining external configuration

The owner supplied the database connection, which is saved only in ignored `.env` with owner-only permissions. The connection verifies the public Supabase root CA and server hostname, and the database has all three committed migrations applied. The complete Fall - 2026 source has been imported through the trusted database-operator CLI: 69 courses, 122 faculty, 496 sections, and 796 distinct meetings. A repeat import skipped all 496 sections without duplicating records. Operator imports record the actual database role and create no Auth account. Detailed per-field verification is recorded in `IMPORT_RESULT.json`. The publishable key, server secret key, and administrator mapping are now configured locally. Live Auth sign-in, session persistence, protected-page access, and logout were verified as described above. Storage bucket configuration/delivery/replacement, anonymous Data API RLS access, production pooling limits, multi-session concurrency, and the Vercel target still require configuration and checks. The implementation does not claim those external checks have been completed.

Integration tests run PostgreSQL WASM through PGlite's socket transport with the real Prisma `pg` adapter. This verifies actual SQL constraints and persistence without a cloud project. The harness reopens its test pool after intentional constraint violations because this test transport can close a connection on an SQL error. It does not establish production concurrency or hosted Postgres performance.

The development-only Next.js ESLint dependency chain has five advisory entries rooted in the `braces` nested-pattern denial-of-service issue. The runtime dependency audit is clean. See the README's toolchain audit note; no incompatible forced downgrade was applied.
