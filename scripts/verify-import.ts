import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { parseAdvisingHtml } from '../src/lib/parser';
import { uniqueMeetings } from '../src/lib/meetings';
import { z } from 'zod';
const file = process.argv[2];
if (!file) throw new Error('Usage: npm run data:verify -- /path/to/advising.html [report.json]');
const semesterName = z.string().min(1).parse(process.env.IMPORT_SEMESTER);
const parsed = parseAdvisingHtml(await readFile(file, 'utf8'));
const client = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: z
      .string()
      .min(1)
      .parse(process.env.DIRECT_URL || process.env.DATABASE_URL),
    max: 2,
    connectionTimeoutMillis: 15000,
  }),
});
const sorted = (values: unknown[]) => values.map((v) => JSON.stringify(v)).sort();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
try {
  const semester = await client.semester.findUniqueOrThrow({ where: { name: semesterName } });
  const sections = await client.courseSection.findMany({
    where: { semesterId: semester.id },
    include: { course: true, assignments: { include: { faculty: true } }, schedules: true },
  });
  const byCode = new Map(sections.map((s) => [`${s.course.code}.${s.number}`, s]));
  const mismatches: { section: string; field: string }[] = [];
  for (const row of parsed.rows) {
    const key = `${row.code}.${row.number}`,
      record = byCode.get(key);
    if (!record) {
      mismatches.push({ section: key, field: 'missing section' });
      continue;
    }
    for (const [field, expected, actual] of [
      ['course title', row.title, record.course.title],
      ['credits', row.credits, Number(record.course.credits)],
      ['available seats', row.availableSeats, record.availableSeats],
      ['source note', row.sourceNote, record.sourceNote],
    ] as const)
      if (expected !== actual) mismatches.push({ section: key, field });
    if (
      !same(
        sorted(row.faculty.map((f) => [f.initials, f.name])),
        sorted(record.assignments.map((a) => [a.faculty.initials, a.faculty.name])),
      )
    )
      mismatches.push({ section: key, field: 'faculty assignment' });
    if (
      !same(
        sorted(uniqueMeetings(row.schedules).map((m) => [m.day, m.startTime, m.endTime, m.room])),
        sorted(record.schedules.map((m) => [m.day, m.startTime, m.endTime, m.room])),
      )
    )
      mismatches.push({ section: key, field: 'schedule or room' });
  }
  const [courses, faculty, allSections, meetings, history] = await Promise.all([
    client.course.count(),
    client.faculty.count(),
    client.courseSection.count(),
    client.sectionSchedule.count(),
    client.importHistory.findMany({
      where: { semesterId: semester.id },
      orderBy: { createdAt: 'asc' },
      select: { fileName: true, adminId: true, databaseRole: true, summary: true, createdAt: true },
    }),
  ]);
  const example = byCode.get('CSE361.9');
  const report = {
    semester: semester.name,
    active: semester.isActive,
    sourceSections: parsed.rows.length,
    verifiedSourceSections: parsed.rows.length - new Set(mismatches.map((m) => m.section)).size,
    invalidSourceRows: parsed.invalid.length,
    courses,
    faculty,
    sections: allSections,
    distinctMeetings: meetings,
    missingFaculty: sections.filter((s) => !s.assignments.length).length,
    sectionExample: example
      ? { courseCode: example.course.code, sectionNumber: example.number }
      : null,
    mismatches,
    history,
  };
  console.log(JSON.stringify(report, null, 2));
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2) + '\n');
  if (mismatches.length || parsed.invalid.length) process.exitCode = 1;
} catch (error) {
  console.error('Import verification failed.', {
    kind: error instanceof Error ? error.name : 'Unknown',
    code: (error as { code?: string }).code ?? null,
  });
  process.exitCode = 1;
} finally {
  await client.$disconnect();
}
