import 'server-only';
import { cache } from 'react';
import snapshot from '../../data/advising-snapshot.json';
import type { Catalog, SourceRow, FacultyView } from './types';
import { db } from './db';
import { uniqueMeetings } from './meetings';
function preview(): Catalog {
  const rows = snapshot.rows as SourceRow[];
  const courseMap = new Map(
    rows.map((r) => [
      r.code,
      {
        id: r.code,
        code: r.code,
        title: r.title,
        credits: r.credits,
        departmentId: null,
        department: null,
      },
    ]),
  );
  const facultyMap = new Map<string, FacultyView>(
    rows.flatMap((r) =>
      r.faculty.map(
        (f) =>
          [
            f.initials,
            {
              id: f.initials,
              ...f,
              departmentId: null,
              department: null,
              photoUrl: null,
              courses: 0,
              sections: 0,
            },
          ] as const,
      ),
    ),
  );
  for (const f of facultyMap.values()) {
    const assigned = rows.filter((r) => r.faculty.some((p) => p.initials === f.initials));
    f.sections = assigned.length;
    f.courses = new Set(assigned.map((r) => r.code)).size;
  }
  return {
    preview: true,
    courses: [...courseMap.values()],
    faculty: [...facultyMap.values()],
    departments: [],
    semesters: [{ id: 'source', name: 'Fall - 2026 · source snapshot', isActive: false }],
    sections: rows.map((r) => ({
      id: `${r.code}.${r.number}`,
      courseId: r.code,
      semesterId: 'source',
      number: r.number,
      availableSeats: r.availableSeats,
      facultyIds: r.faculty.map((f) => f.initials),
      schedules: uniqueMeetings(r.schedules),
      groups: [],
    })),
    notice: '',
    submissionsEnabled: false,
  };
}
export const getCatalog = cache(async (): Promise<Catalog> => {
  if (!process.env.DATABASE_URL) return preview();
  const client = db();
  const [faculty, courses, semesters, sections, departments, settings] = await Promise.all([
    client.faculty.findMany({
      include: {
        department: true,
        assignments: { include: { section: { select: { courseId: true } } } },
      },
      orderBy: { name: 'asc' },
    }),
    client.course.findMany({ include: { department: true }, orderBy: { code: 'asc' } }),
    client.semester.findMany({
      orderBy: [{ isActive: 'desc' }, { startsAt: 'desc' }, { name: 'desc' }],
    }),
    client.courseSection.findMany({
      include: { assignments: true, schedules: true, groups: { orderBy: { createdAt: 'asc' } } },
    }),
    client.department.findMany({ orderBy: { name: 'asc' } }),
    client.appSettings.findUnique({ where: { id: 'default' } }),
  ]);
  return {
    preview: false,
    departments,
    notice: settings?.notice ?? '',
    submissionsEnabled: settings?.submissionsEnabled ?? true,
    semesters: semesters.map((s) => ({ id: s.id, name: s.name, isActive: s.isActive })),
    faculty: faculty.map((f) => ({
      id: f.id,
      initials: f.initials,
      name: f.name,
      departmentId: f.departmentId,
      department: f.department?.name ?? null,
      photoUrl:
        f.photoPath && process.env.NEXT_PUBLIC_SUPABASE_URL
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/faculty-photos/${f.photoPath}`
          : null,
      courses: new Set(f.assignments.map((a) => a.section.courseId)).size,
      sections: f.assignments.length,
    })),
    courses: courses.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      credits: Number(c.credits),
      departmentId: c.departmentId,
      department: c.department?.name ?? null,
    })),
    sections: sections.map((s) => ({
      id: s.id,
      courseId: s.courseId,
      semesterId: s.semesterId,
      number: s.number,
      availableSeats: s.availableSeats,
      facultyIds: s.assignments.map((a) => a.facultyId),
      schedules: s.schedules.map((m) => ({
        day: m.day,
        startTime: m.startTime,
        endTime: m.endTime,
        room: m.room,
      })),
      groups: s.groups.map((g) => ({ id: g.id, url: g.url, createdAt: g.createdAt.toISOString() })),
    })),
  };
});
