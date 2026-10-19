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
function previewFaculty(facultyId: string): Catalog {
  const data = preview();
  const sections = data.sections.filter((s) => s.facultyIds.includes(facultyId));
  const facultyIds = new Set([facultyId, ...sections.flatMap((s) => s.facultyIds)]);
  return {
    ...data,
    sections,
    courses: data.courses.filter((c) => sections.some((s) => s.courseId === c.id)),
    faculty: data.faculty.filter((f) => facultyIds.has(f.id)),
  };
}
async function readCatalog(facultyId?: string): Promise<Catalog> {
  if (!process.env.DATABASE_URL) return facultyId ? previewFaculty(facultyId) : preview();
  const client = db();
  const [faculty, courses, semesters, sections, departments, settings] = await Promise.all([
    client.faculty.findMany({
      where: facultyId
        ? {
            OR: [
              { id: facultyId },
              { assignments: { some: { section: { assignments: { some: { facultyId } } } } } },
            ],
          }
        : undefined,
      include: { department: true },
      orderBy: { name: 'asc' },
    }),
    client.course.findMany({
      where: facultyId
        ? { sections: { some: { assignments: { some: { facultyId } } } } }
        : undefined,
      include: { department: true },
      orderBy: { code: 'asc' },
    }),
    client.semester.findMany({
      orderBy: [{ isActive: 'desc' }, { startsAt: 'desc' }, { name: 'desc' }],
    }),
    client.courseSection.findMany({
      where: facultyId ? { assignments: { some: { facultyId } } } : undefined,
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
    faculty: faculty.map((f) => {
      const assigned = sections.filter((s) => s.assignments.some((a) => a.facultyId === f.id));
      return {
        id: f.id,
        initials: f.initials,
        name: f.name,
        departmentId: f.departmentId,
        department: f.department?.name ?? null,
        photoUrl:
          f.photoPath && process.env.NEXT_PUBLIC_SUPABASE_URL
            ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/faculty-photos/${f.photoPath}`
            : null,
        courses: new Set(assigned.map((s) => s.courseId)).size,
        sections: assigned.length,
      };
    }),
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
}
export const getCatalog = cache(() => readCatalog());
export const getFacultyCatalog = cache((facultyId: string) => readCatalog(facultyId));
