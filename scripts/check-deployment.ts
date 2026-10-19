/** Read-only deployment audit. This script never imports mutation services or signs in. */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Pool, type PoolClient } from 'pg';
import { migrationNames } from './migration-files';
import { parseAdvisingHtml } from '../src/lib/parser';
import { uniqueMeetings } from '../src/lib/meetings';

const args = process.argv.slice(2);
const option = (name: string) => args[args.indexOf(name) + 1];
const source = args.includes('--source') ? option('--source') : 'tests/fixtures/advising.html';
const output = args.includes('--output') ? option('--output') : undefined;
const connection = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connection) throw new Error('Configure a database URL for the read-only audit.');
const tables = [
  'Department',
  'Faculty',
  'Course',
  'Semester',
  'CourseSection',
  'TeachingAssignment',
  'SectionSchedule',
  'MessengerGroupLink',
  'GroupReport',
  'AdminUser',
  'ImportHistory',
  'RateLimitBucket',
  'AppSettings',
];
const warnings: string[] = [];
const blockers: string[] = [];
const configured = Object.fromEntries(
  [
    'DATABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'RATE_LIMIT_SECRET',
    'APP_URL',
  ].map((key) => [key, Boolean(process.env[key])]),
);
for (const [key, value] of Object.entries(configured))
  if (!value && !['SUPABASE_SECRET_KEY', 'APP_URL'].includes(key)) blockers.push(`Missing ${key}.`);
if ((process.env.RATE_LIMIT_SECRET?.length ?? 0) < 32)
  blockers.push('RATE_LIMIT_SECRET needs at least 32 random characters.');
let runtimeUrl: URL | null = null;
if (process.env.DATABASE_URL) {
  try {
    runtimeUrl = new URL(process.env.DATABASE_URL);
  } catch {
    blockers.push('DATABASE_URL is not a valid PostgreSQL URL.');
  }
}
if (runtimeUrl?.hostname.endsWith('.pooler.supabase.com') && runtimeUrl.port === '5432')
  warnings.push(
    'DATABASE_URL specifies the session pooler. The current Vercel runtime automatically uses port 6543 with one local connection; an explicit dashboard-provided transaction URL is still preferred. Retain the session/direct URL for migrations.',
  );
const appUrl = process.env.APP_URL?.trim();
if (appUrl) {
  try {
    const url = new URL(appUrl);
    if (url.origin !== appUrl)
      blockers.push('APP_URL must be the exact origin without a path or trailing slash.');
    if (url.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname))
      warnings.push(
        'APP_URL pins a local or non-HTTPS origin. Omit it on Vercel to use the serving domain automatically, or set a canonical HTTPS origin.',
      );
  } catch {
    blockers.push('APP_URL is not a valid URL.');
  }
}
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
let publicRole = '';
try {
  publicRole =
    JSON.parse(Buffer.from(publicKey.split('.')[1] ?? '', 'base64url').toString()).role ?? '';
} catch {
  /* New publishable keys are opaque. */
}
if (publicKey && !publicKey.startsWith('sb_publishable_') && publicRole !== 'anon')
  blockers.push('The browser key is not a recognized publishable/anon key.');
if (publicKey && publicKey === process.env.SUPABASE_SECRET_KEY)
  blockers.push('The browser and privileged keys must be different.');
const pool = new Pool({
  connectionString: connection,
  max: 1,
  connectionTimeoutMillis: 15000,
  options: '-c default_transaction_read_only=on',
});
let client: PoolClient | undefined;
try {
  client = await pool.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const readOnly =
    (await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only === 'on';
  if (!readOnly) throw new Error('Refusing to audit without a read-only transaction.');
  const fingerprints: Record<string, { count: number; fingerprint: string }> = {};
  for (const table of tables) {
    const result = await client.query(
      `SELECT count(*)::int AS count, md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) AS fingerprint FROM public."${table}" AS t`,
    );
    fingerprints[table] = result.rows[0];
  }
  const migrations = (
    await client.query(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM public."_prisma_migrations" ORDER BY migration_name',
    )
  ).rows;
  for (const name of migrationNames()) {
    const checksum = createHash('sha256')
      .update(await readFile(`prisma/migrations/${name}/migration.sql`))
      .digest('hex');
    if (
      !migrations.some(
        (m) =>
          m.migration_name === name &&
          m.checksum === checksum &&
          m.finished_at &&
          !m.rolled_back_at,
      )
    )
      blockers.push(`Migration is missing, incomplete, or changed: ${name}`);
  }
  const security = (
    await client.query(
      `SELECT c.relname AS table, c.relrowsecurity AS rls,
    has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS anon_access,
    has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS authenticated_access
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,
      [tables],
    )
  ).rows;
  for (const table of security)
    if (!table.rls || table.anon_access || table.authenticated_access)
      blockers.push(`Review browser database access protection for ${table.table}.`);
  const appPolicies = Number(
    (
      await client.query(
        "SELECT count(*)::int AS count FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[])",
        [tables],
      )
    ).rows[0].count,
  );
  if (appPolicies)
    warnings.push('Application Data API policies exist; review them before publishing.');
  const invalidIndexes = Number(
    (
      await client.query(
        `SELECT count(*)::int AS count FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND NOT i.indisvalid`,
        [tables],
      )
    ).rows[0].count,
  );
  if (invalidIndexes) blockers.push('Application indexes include invalid indexes.');
  const admin = (
    await client.query(
      `SELECT count(*)::int AS mappings, count(u.id)::int AS auth_users, count(*) FILTER (WHERE u.email_confirmed_at IS NOT NULL)::int AS confirmed FROM public."AdminUser" a LEFT JOIN auth.users u ON u.id=a."userId"`,
    )
  ).rows[0];
  if (!admin.mappings || admin.mappings !== admin.auth_users || admin.confirmed !== admin.mappings)
    blockers.push('Administrator mappings need an existing confirmed Auth account.');
  const authFingerprint = (
    await client.query(
      `SELECT md5(coalesce(string_agg(id::text || coalesce(email,'') || coalesce(last_sign_in_at::text,'') || coalesce(updated_at::text,''), ',' ORDER BY id),'')) AS fingerprint FROM auth.users`,
    )
  ).rows[0].fingerprint;
  const buckets = (
    await client.query(
      "SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='faculty-photos'",
    )
  ).rows;
  const bucket = buckets[0] ?? null;
  if (!bucket)
    warnings.push(
      'The faculty-photos bucket is missing. Photo uploads need supabase/storage.sql applied separately by the owner.',
    );
  else if (
    !bucket.public ||
    Number(bucket.file_size_limit) !== 2097152 ||
    !Array.isArray(bucket.allowed_mime_types) ||
    bucket.allowed_mime_types.length !== 1 ||
    bucket.allowed_mime_types[0] !== 'image/webp'
  )
    warnings.push(
      'Review faculty-photos public read, 2 MiB limit, and WebP-only bucket configuration.',
    );
  const storagePolicies = (
    await client.query(
      "SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd <> 'SELECT'",
    )
  ).rows;
  if (storagePolicies.length)
    warnings.push(
      'Storage write policies exist. Review whether they permit browser writes to faculty-photos.',
    );
  const parsed = parseAdvisingHtml(await readFile(source, 'utf8'));
  const semesterName = process.env.IMPORT_SEMESTER || 'Fall - 2026';
  const rows = (
    await client.query(
      `SELECT c.code, c.title, c.credits, s.id, s.number, s."availableSeats", s."sourceNote"
    FROM public."CourseSection" s JOIN public."Course" c ON c.id=s."courseId" JOIN public."Semester" t ON t.id=s."semesterId" WHERE t.name=$1`,
      [semesterName],
    )
  ).rows;
  const assignments = (
    await client.query(
      `SELECT a."sectionId", f.initials, f.name FROM public."TeachingAssignment" a JOIN public."Faculty" f ON f.id=a."facultyId"`,
    )
  ).rows;
  const schedules = (
    await client.query(
      'SELECT "sectionId", day, "startTime", "endTime", room FROM public."SectionSchedule"',
    )
  ).rows;
  const sorted = (values: unknown[]) =>
    values
      .map((v) => JSON.stringify(v))
      .sort()
      .join('\n');
  const byCode = new Map(rows.map((row) => [`${row.code}.${row.number}`, row]));
  const mismatches: { section: string; field: string }[] = [];
  for (const row of parsed.rows) {
    const section = `${row.code}.${row.number}`;
    const stored = byCode.get(section);
    if (!stored) {
      mismatches.push({ section, field: 'missing section' });
      continue;
    }
    for (const [field, expected, actual] of [
      ['title', row.title, stored.title],
      ['credits', row.credits, Number(stored.credits)],
      ['seats', row.availableSeats, stored.availableSeats],
      ['source note', row.sourceNote, stored.sourceNote],
    ])
      if (expected !== actual) mismatches.push({ section, field: String(field) });
    if (
      sorted(row.faculty.map((f) => [f.initials, f.name])) !==
      sorted(assignments.filter((a) => a.sectionId === stored.id).map((a) => [a.initials, a.name]))
    )
      mismatches.push({ section, field: 'faculty assignments' });
    if (
      sorted(uniqueMeetings(row.schedules).map((m) => [m.day, m.startTime, m.endTime, m.room])) !==
      sorted(
        schedules
          .filter((m) => m.sectionId === stored.id)
          .map((m) => [m.day, m.startTime, m.endTime, m.room]),
      )
    )
      mismatches.push({ section, field: 'meetings' });
  }
  if (mismatches.length)
    warnings.push(
      'Stored advising fields differ from the supplied source. Review the recorded differences; this audit does not overwrite manual changes.',
    );
  if (parsed.invalid.length) blockers.push('The supplied HTML includes invalid source rows.');
  await client.query('ROLLBACK');
  const report = {
    checkedAt: new Date().toISOString(),
    readOnlyTransaction: readOnly,
    configured,
    runtimeConnection: {
      pooler: runtimeUrl?.hostname.endsWith('.pooler.supabase.com') ?? false,
      port: runtimeUrl?.port,
      tlsMode: runtimeUrl?.searchParams.get('sslmode') ?? 'unspecified',
    },
    migrationsVerified: migrationNames().length,
    fingerprints,
    authFingerprint,
    security,
    appPolicies,
    invalidIndexes,
    admin,
    storage: { bucket, writePolicies: storagePolicies.length },
    source: {
      semester: semesterName,
      rows: parsed.rows.length,
      invalid: parsed.invalid.length,
      mismatches,
    },
    warnings,
    blockers,
  };
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(
    JSON.stringify(
      {
        ...report,
        fingerprints: Object.fromEntries(
          Object.entries(fingerprints).map(([key, value]) => [key, { count: value.count }]),
        ),
        authFingerprint: 'recorded only in optional local report',
      },
      null,
      2,
    ),
  );
  if (blockers.length) process.exitCode = 1;
} catch (error) {
  await client?.query('ROLLBACK').catch(() => {});
  console.error('Read-only deployment audit failed.', {
    kind: error instanceof Error ? error.name : 'Unknown',
    code: (error as { code?: string }).code ?? null,
  });
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
