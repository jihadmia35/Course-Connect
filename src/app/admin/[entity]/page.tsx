import { notFound } from 'next/navigation';
import { getAdminCatalog } from '@/lib/catalog';
import { db } from '@/lib/db';
import { requireAdminPage } from '@/lib/auth';
import { AdminManager, ImportPanel } from '@/components/admin-manager';
export const maxDuration = 120;
export default async function AdminEntity({ params }: { params: Promise<{ entity: string }> }) {
  await requireAdminPage();
  const { entity } = await params;
  if (
    ![
      'faculty',
      'courses',
      'sections',
      'semesters',
      'departments',
      'groups',
      'reports',
      'imports',
      'settings',
    ].includes(entity)
  )
    notFound();
  const catalog = await getAdminCatalog();
  if (entity === 'imports') {
    const history = await db().importHistory.findMany({
      take: 30,
      orderBy: { createdAt: 'desc' },
      include: { semester: true },
    });
    return (
      <ImportPanel
        catalog={catalog}
        history={history.map((h) => ({
          id: h.id,
          semester: h.semester.name,
          fileName: h.fileName,
          summary: h.summary,
          actor: h.adminId ? `Administrator ${h.adminId}` : `Database operator (${h.databaseRole})`,
          createdAt: h.createdAt.toISOString(),
        }))}
      />
    );
  }
  let records: Record<string, unknown>[] = [];
  if (entity === 'faculty')
    records = catalog.faculty.map((f) => ({
      ...f,
      courseCount: f.courses,
      sectionCount: f.sections,
    }));
  else if (entity === 'courses') records = catalog.courses;
  else if (entity === 'sections')
    records = catalog.sections.map((s) => ({
      ...s,
      course: catalog.courses.find((c) => c.id === s.courseId)?.code,
      semester: catalog.semesters.find((t) => t.id === s.semesterId)?.name,
      facultyIds: s.facultyIds,
      schedules: s.schedules
        .map((m) => `${m.day} ${m.startTime} ${m.endTime} ${m.room}`)
        .join('\n'),
    }));
  else if (entity === 'semesters')
    records = (await db().semester.findMany({ orderBy: { name: 'desc' } })).map((s) => ({
      ...s,
      startsAt: s.startsAt?.toISOString().slice(0, 10) ?? '',
    }));
  else if (entity === 'departments') records = catalog.departments;
  else if (entity === 'groups')
    records = (
      await db().messengerGroupLink.findMany({
        include: { section: { include: { course: true, semester: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
    ).map((g) => ({
      id: g.id,
      url: g.url,
      section: `${g.section.course.code}.${g.section.number}`,
      semester: g.section.semester.name,
      createdAt: g.createdAt.toISOString(),
    }));
  else if (entity === 'reports')
    records = (
      await db().groupReport.findMany({
        include: { group: { include: { section: { include: { course: true, semester: true } } } } },
        orderBy: [{ resolved: 'asc' }, { createdAt: 'desc' }],
      })
    ).map((r) => ({
      id: r.id,
      reason: r.reason,
      details: r.details,
      resolved: r.resolved,
      url: r.group.url,
      section: `${r.group.section.course.code}.${r.group.section.number}`,
      semester: r.group.section.semester.name,
    }));
  else if (entity === 'settings')
    records = [
      (await db().appSettings.findUnique({ where: { id: 'default' } })) ?? {
        id: 'default',
        notice: '',
        submissionsEnabled: true,
      },
    ];
  return <AdminManager entity={entity} records={records} catalog={catalog} />;
}
