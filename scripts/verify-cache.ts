/** Real Next Data Cache check. All database data and connections are disposable. */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { load } from 'cheerio';
import { readFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { migrationNames } from './migration-files';
import { importHtml } from '../src/lib/importer';

const origin = 'http://127.0.0.1:3004';
const engine = await PGlite.create();
const database = new PGLiteSocketServer({
  db: engine,
  port: 0,
  host: '127.0.0.1',
  maxConnections: 10,
});
let app: ChildProcess | undefined;
let client: PrismaClient | undefined;
let stopped = false;
let engineClosed = false;
try {
  for (const name of migrationNames())
    await engine.exec(readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8'));
  await database.start();
  const url = `postgresql://postgres:postgres@${database.getServerConn()}/postgres?sslmode=disable`;
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });
  const semester = await client.semester.create({
    data: { name: 'Cache test term', isActive: true },
  });
  const $ = load(readFileSync('tests/fixtures/advising.html', 'utf8'));
  const rows = $('.ums-grid-offered-section')
    .slice(0, 4)
    .toArray()
    .map((node) => $.html(node))
    .join('\n');
  await importHtml(client, rows, semester.id, null, 'cache-test-fixture.html');
  const faculty = await client.faculty.findMany({ orderBy: { initials: 'asc' } });
  assert.equal(faculty.length, 3);
  await client.$disconnect();

  app = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3004'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        DATABASE_URL: url,
        DIRECT_URL: url,
        APP_URL: '',
        VERCEL: '',
        NEXT_PUBLIC_SUPABASE_URL: '',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
        SUPABASE_SECRET_KEY: '',
        RATE_LIMIT_SECRET: 'isolated-cache-tests-only-not-for-production',
      },
    },
  );
  let logs = '';
  app.stdout?.on('data', (data: Buffer) => {
    logs += data.toString();
  });
  app.stderr?.on('data', (data: Buffer) => {
    logs += data.toString();
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (app.exitCode !== null) throw new Error('Isolated Next server exited before readiness.');
    try {
      ready = (await fetch(origin + '/about', { signal: AbortSignal.timeout(1000) })).ok;
    } catch {
      /* Starting. */
    }
    if (ready) break;
    await delay(250);
  }
  assert(ready, 'Isolated Next server did not start.');
  async function read(path: string, expected: string) {
    const response = await fetch(origin + path, { signal: AbortSignal.timeout(5000) });
    assert(response.ok);
    const body = await response.text();
    assert(body.includes(expected), `Missing expected public content for ${path}`);
    assert(!body.includes('We couldn’t load'), `Directory error for ${path}`);
    assert(!body.includes('timeout exceeded'), `Database timeout for ${path}`);
  }
  // Warm ONLY the full directory, not the three faculty URLs below.
  await read('/', 'ACT141');
  await read('/courses', 'Introduction to Accounting');
  await database.stop();
  stopped = true;
  await engine.close();
  engineClosed = true;
  const start = performance.now();
  await Promise.all(
    Array.from({ length: 30 }, (_, index) => {
      const person = faculty[index % faculty.length]!;
      return read(`/faculty/${person.id}`, person.name);
    }),
  );
  await read('/faculty', 'Dr. Faieza Chowdhury');
  await read('/courses', 'ACT141');
  assert(!logs.includes('timeout exceeded'), 'A supposedly cached request attempted SQL.');
  console.log(
    `PASS: 30 fresh requests to previously unseen faculty URLs succeeded after the disposable database was stopped (${Math.round(performance.now() - start)} ms).`,
  );
  console.log(
    'PASS: public course/faculty directories also remained available from the real Next Data Cache.',
  );
} finally {
  if (app && app.exitCode === null) {
    const exited = new Promise<void>((resolve) => app!.once('exit', () => resolve()));
    app.kill('SIGTERM');
    await exited;
  }
  await client?.$disconnect();
  if (!stopped) await database.stop();
  if (!engineClosed) await engine.close();
}
