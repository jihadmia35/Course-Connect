import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { importHtml } from '../src/lib/importer';
import { parseAdvisingHtml } from '../src/lib/parser';
import { z } from 'zod';
const args = process.argv.slice(2),
  operator = args.includes('--database-operator'),
  activate = args.includes('--activate');
if (
  args.some((arg) => arg.startsWith('--') && !['--database-operator', '--activate'].includes(arg))
)
  throw new Error('Unknown import option.');
const file = args.find((arg) => !arg.startsWith('--')) || 'tests/fixtures/advising.html';
const connectionString = z
  .string()
  .min(1)
  .parse(process.env.DIRECT_URL || process.env.DATABASE_URL);
const semesterName = z.string().trim().min(1).parse(process.env.IMPORT_SEMESTER);
const adminId = operator ? null : z.uuid().parse(process.env.ADMIN_USER_ID);
const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 2, connectionTimeoutMillis: 15000 }),
});
try {
  const html = await readFile(file, 'utf8');
  const parsed = parseAdvisingHtml(html);
  if (!parsed.rows.length) throw new Error('No valid sections to import.');
  if (adminId !== null) {
    const admin = await client.adminUser.findUnique({ where: { userId: adminId } });
    if (!admin)
      throw new Error(
        'Grant the existing Supabase Auth user admin access, or use --database-operator with trusted database credentials.',
      );
  }
  const semester = await client.$transaction(async (tx) => {
    if (activate)
      await tx.semester.updateMany({ where: { isActive: true }, data: { isActive: false } });
    return tx.semester.upsert({
      where: { name: semesterName },
      create: { name: semesterName, isActive: activate },
      update: activate ? { isActive: true } : {},
    });
  });
  const summary = await importHtml(
    client,
    html,
    semester.id,
    adminId,
    file.split('/').pop() ?? 'advising.html',
  );
  console.log(
    JSON.stringify(
      {
        semester: semester.name,
        actor: operator ? 'database operator' : 'administrator',
        ...summary,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error('Import failed.', {
    kind: error instanceof Error ? error.name : 'Unknown',
    code: (error as { code?: string }).code ?? null,
  });
  process.exitCode = 1;
} finally {
  await client.$disconnect();
}
