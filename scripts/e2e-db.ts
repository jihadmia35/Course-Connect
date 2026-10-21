import { migrationNames } from './migration-files';
import { load } from 'cheerio';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { importHtml } from '../src/lib/importer';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const engine = await PGlite.create();
for (const name of migrationNames())
  await engine.exec(readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8'));
const server = new PGLiteSocketServer({
  db: engine,
  port: 0,
  host: '127.0.0.1',
  maxConnections: 10,
});
await server.start();
const url = `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`;
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });
try {
  const semester = await client.semester.create({ data: { name: 'Fall - 2026', isActive: true } });
  const $ = load(readFileSync('tests/fixtures/advising.html', 'utf8'));
  const rows = $('.ums-grid-offered-section')
    .slice(0, 4)
    .toArray()
    .map((node) => $.html(node))
    .join('\n');
  await importHtml(
    client,
    rows,
    semester.id,
    '11111111-1111-4111-8111-111111111111',
    'sanitized-e2e-fixture.html',
  );
  const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      E2E_DATABASE: '1',
      DATABASE_URL: url,
      DIRECT_URL: url,
      APP_URL: '',
      RATE_LIMIT_SECRET: 'local-ephemeral-tests-only-never-use-in-production',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      // Never inherit a production Redis store into the disposable write tests.
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
    },
  });
  process.exitCode = await new Promise<number>((resolve) =>
    child.on('exit', (code) => resolve(code ?? 1)),
  );
} finally {
  await client.$disconnect();
  await server.stop();
  await engine.close();
}
