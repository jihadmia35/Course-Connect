import { migrationNames } from './migration-files';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const engine = await PGlite.create();
const server = new PGLiteSocketServer({
  db: engine,
  port: 0,
  host: '127.0.0.1',
  maxConnections: 4,
});
await server.start();
const run = promisify(execFile);
const env = {
  ...process.env,
  DIRECT_URL: `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`,
  DATABASE_URL: `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`,
  PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1',
};
try {
  for (let i = 0; i < 2; i++) {
    const result = await run(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      { env, timeout: 90000 },
    );
    console.log(result.stdout);
  }
  const result = await run(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'status'],
    { env, timeout: 90000 },
  );
  console.log(result.stdout);
  const { rows } = await engine.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
  );
  if (rows[0]?.count !== migrationNames().length)
    throw new Error('Expected every migration to apply.');
  console.log('All migrations applied successfully and a repeat deploy was idempotent.');
} finally {
  await server.stop();
  await engine.close();
}
