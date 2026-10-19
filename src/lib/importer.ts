import type { PrismaClient } from '@/generated/prisma/client';
import { Prisma } from '@/generated/prisma/client';
import { fingerprint, parseAdvisingHtml } from './parser';
import { uniqueMeetings } from './meetings';

/** Server actions supply the verified admin UUID; trusted CLI operators supply null. */
export async function importHtml(
  client: PrismaClient,
  html: string,
  semesterId: string,
  adminId: string | null,
  fileName: string,
) {
  const parsed = parseAdvisingHtml(html);
  return client.$transaction(
    async (tx) => {
      const semester = await tx.semester.findUniqueOrThrow({ where: { id: semesterId } });
      await tx.$queryRaw`SELECT id FROM "Semester" WHERE id = ${semester.id} FOR UPDATE`;
      const summary = {
        inserted: 0,
        updated: 0,
        skipped: parsed.duplicates,
        invalid: parsed.invalid.length,
        issues: parsed.invalid,
        duplicateMeetings: parsed.rows.reduce(
          (n, r) => n + r.schedules.length - uniqueMeetings(r.schedules).length,
          0,
        ),
      };
      const sourceCourses = [
        ...new Map(
          parsed.rows.map((r) => [r.code, { code: r.code, title: r.title, credits: r.credits }]),
        ).values(),
      ];
      const sourceFaculty = [
        ...new Map(
          parsed.rows.flatMap((r) => r.faculty.map((f) => [f.initials, f] as const)),
        ).values(),
      ];
      // Batch inserts avoid thousands of network round trips for a full advising file.
      await tx.course.createMany({ data: sourceCourses, skipDuplicates: true });
      await tx.faculty.createMany({ data: sourceFaculty, skipDuplicates: true });
      const courses = await tx.course.findMany({
        where: { code: { in: sourceCourses.map((c) => c.code) } },
      });
      const faculty = await tx.faculty.findMany({
        where: { initials: { in: sourceFaculty.map((f) => f.initials) } },
      });
      const courseMap = new Map(courses.map((c) => [c.code, c]));
      const facultyMap = new Map(faculty.map((f) => [f.initials, f]));
      for (const c of sourceCourses) {
        const existing = courseMap.get(c.code)!;
        if (existing.title !== c.title || Number(existing.credits) !== c.credits)
          await tx.course.update({
            where: { id: existing.id },
            data: { title: c.title, credits: c.credits },
          });
      }
      for (const f of sourceFaculty) {
        const existing = facultyMap.get(f.initials)!;
        if (existing.name !== f.name)
          await tx.faculty.update({ where: { id: existing.id }, data: { name: f.name } });
      }
      const existingSections = await tx.courseSection.findMany({
        where: { semesterId, courseId: { in: courses.map((c) => c.id) } },
      });
      const byIdentity = new Map(existingSections.map((s) => [`${s.courseId}.${s.number}`, s]));
      const changed = parsed.rows.flatMap((row) => {
        const courseId = courseMap.get(row.code)!.id,
          hash = fingerprint(row);
        const existing = byIdentity.get(`${courseId}.${row.number}`);
        if (existing?.sourceHash === hash) {
          summary.skipped++;
          return [];
        }
        if (existing) summary.updated++;
        else summary.inserted++;
        return [{ row, courseId, hash, existing }];
      });
      await tx.courseSection.createMany({
        data: changed
          .filter((p) => !p.existing)
          .map((p) => ({
            semesterId,
            courseId: p.courseId,
            number: p.row.number,
            sourceHash: p.hash,
            sourceNote: p.row.sourceNote,
            availableSeats: p.row.availableSeats,
          })),
        skipDuplicates: true,
      });
      for (const plan of changed) {
        if (plan.existing)
          await tx.courseSection.update({
            where: { id: plan.existing.id },
            data: {
              sourceHash: plan.hash,
              sourceNote: plan.row.sourceNote,
              availableSeats: plan.row.availableSeats,
            },
          });
      }
      if (changed.length) {
        const sections = await tx.courseSection.findMany({
          where: { semesterId, courseId: { in: courses.map((c) => c.id) } },
        });
        const sectionMap = new Map(sections.map((s) => [`${s.courseId}.${s.number}`, s.id]));
        const plans = changed.map((p) => ({
          ...p,
          sectionId: sectionMap.get(`${p.courseId}.${p.row.number}`)!,
        }));
        const sectionIds = plans.map((p) => p.sectionId);
        await tx.teachingAssignment.deleteMany({ where: { sectionId: { in: sectionIds } } });
        await tx.sectionSchedule.deleteMany({ where: { sectionId: { in: sectionIds } } });
        await tx.teachingAssignment.createMany({
          data: plans.flatMap((p) =>
            p.row.faculty.map((f) => ({
              sectionId: p.sectionId,
              facultyId: facultyMap.get(f.initials)!.id,
            })),
          ),
          skipDuplicates: true,
        });
        await tx.sectionSchedule.createMany({
          data: plans.flatMap((p) =>
            uniqueMeetings(p.row.schedules).map((s) => ({ ...s, sectionId: p.sectionId })),
          ),
          skipDuplicates: true,
        });
      }
      let databaseRole: string | null = null;
      if (adminId === null) {
        const roles = await tx.$queryRaw<{ role: string }[]>`SELECT current_user AS role`;
        databaseRole = roles[0]?.role ?? null;
        if (!databaseRole) throw new Error('Could not identify the database operator.');
      }
      await tx.importHistory.create({
        data: {
          semesterId,
          fileName: fileName.slice(0, 200),
          adminId,
          databaseRole,
          checksum: fingerprint(html),
          summary: summary as Prisma.InputJsonValue,
        },
      });
      return summary;
    },
    { timeout: 120000, maxWait: 10000 },
  );
}
