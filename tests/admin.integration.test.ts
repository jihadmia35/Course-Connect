import { migrationNames } from '../scripts/migration-files';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const state = vi.hoisted(() => ({ client: undefined as PrismaClient | undefined }));
vi.mock('@/lib/db', () => ({ db: () => state.client! }));
vi.mock('@/lib/auth', () => ({
  requireAdmin: async () => ({ id: '11111111-1111-4111-8111-111111111111' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { saveRecord, deleteRecord, uploadPhoto } from '@/app/admin/actions';
let engine: PGlite,
  server: PGLiteSocketServer,
  departmentId: string,
  facultyId: string,
  courseId: string,
  semesterId: string,
  sectionId: string,
  groupId: string,
  reportId: string;
function form(values: Record<string, string | boolean | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values))
    for (const item of Array.isArray(value)
      ? value
      : [typeof value === 'boolean' ? (value ? 'on' : '') : value])
      data.append(key, item);
  return data;
}
beforeAll(async () => {
  engine = await PGlite.create();
  for (const name of migrationNames())
    await engine.exec(readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8'));
  server = new PGLiteSocketServer({ db: engine, port: 0, host: '127.0.0.1', maxConnections: 4 });
  await server.start();
  state.client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`,
      max: 1,
    }),
  });
});
afterAll(async () => {
  await state.client?.$disconnect();
  await server?.stop();
  await engine?.close();
  vi.unstubAllEnvs();
});
describe('authorized admin operations with real PostgreSQL persistence', () => {
  it('creates departments, faculty and reusable courses with validation', async () => {
    expect(
      await saveRecord(
        'departments',
        '',
        form({ code: 'TEST', name: 'Test department — integration only' }),
      ),
    ).toMatchObject({ ok: true });
    departmentId = (await state.client!.department.findFirstOrThrow()).id;
    expect(
      await saveRecord(
        'faculty',
        '',
        form({ initials: 'FZC', name: 'Dr. Faieza Chowdhury', departmentId }),
      ),
    ).toMatchObject({ ok: true });
    facultyId = (await state.client!.faculty.findFirstOrThrow()).id;
    expect(
      await saveRecord(
        'courses',
        '',
        form({ code: 'ACT141', title: 'Introduction to Accounting', credits: '3', departmentId }),
      ),
    ).toMatchObject({ ok: true });
    courseId = (await state.client!.course.findFirstOrThrow()).id;
    expect(
      await saveRecord(
        'courses',
        courseId,
        form({ code: 'ACT141', title: 'Introduction to Accounting', credits: '-1', departmentId }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      Number((await state.client!.course.findUniqueOrThrow({ where: { id: courseId } })).credits),
    ).toBe(3);
  });
  it('manages the active semester without duplicating default flags', async () => {
    await saveRecord(
      'semesters',
      '',
      form({ name: 'Test inactive term', startsAt: '2026-01-01', isActive: true }),
    );
    await saveRecord(
      'semesters',
      '',
      form({ name: 'Fall - 2026', startsAt: '2026-09-01', isActive: true }),
    );
    expect(await state.client!.semester.count({ where: { isActive: true } })).toBe(1);
    semesterId = (await state.client!.semester.findFirstOrThrow({ where: { isActive: true } })).id;
  });
  it('creates and edits a section with faculty and multiple meetings', async () => {
    const values = {
      courseId,
      semesterId,
      number: '1',
      availableSeats: '17',
      facultyIds: [facultyId],
      schedules: 'SUN 08:30 09:50 SEU516\nTUE 08:30 09:50 SEU516',
    };
    expect(await saveRecord('sections', '', form(values))).toMatchObject({ ok: true });
    const section = await state.client!.courseSection.findFirstOrThrow({
      include: { assignments: true, schedules: true },
    });
    sectionId = section.id;
    expect(section.assignments[0]?.facultyId).toBe(facultyId);
    expect(section.schedules).toHaveLength(2);
    expect(
      await saveRecord(
        'sections',
        sectionId,
        form({ ...values, schedules: 'SUN 09:50 08:30 SEU516' }),
      ),
    ).toMatchObject({ ok: false });
    expect(await state.client!.sectionSchedule.count()).toBe(2);
  });
  it('edits group URLs and prevents moving a group-bearing section', async () => {
    groupId = (
      await state.client!.messengerGroupLink.create({
        data: {
          sectionId,
          url: 'https://m.me/j/AdminTestInvite',
          normalizedUrl: 'https://m.me/j/AdminTestInvite',
        },
      })
    ).id;
    expect(
      await saveRecord(
        'groups',
        groupId,
        form({ url: 'https://www.m.me/j/EditedTestInvite/?utm_source=admin' }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      (await state.client!.messengerGroupLink.findUniqueOrThrow({ where: { id: groupId } }))
        .normalizedUrl,
    ).toBe('https://m.me/j/EditedTestInvite');
    expect(
      await saveRecord(
        'sections',
        sectionId,
        form({
          courseId,
          semesterId,
          number: '2',
          availableSeats: '17',
          facultyIds: [facultyId],
          schedules: 'SUN 08:30 09:50 SEU516',
        }),
      ),
    ).toMatchObject({ ok: false, message: expect.stringContaining('cannot be moved') });
    expect(
      (await state.client!.courseSection.findUniqueOrThrow({ where: { id: sectionId } })).number,
    ).toBe('1');
  });
  it('resolves reports and persists settings', async () => {
    reportId = (
      await state.client!.groupReport.create({
        data: { groupId, reason: 'Broken invite', details: 'Synthetic local integration report.' },
      })
    ).id;
    expect(await saveRecord('reports', reportId, form({ resolved: true }))).toMatchObject({
      ok: true,
    });
    expect(
      (await state.client!.groupReport.findUniqueOrThrow({ where: { id: reportId } })).resolved,
    ).toBe(true);
    expect(
      await saveRecord(
        'settings',
        'default',
        form({ notice: 'Integration test notice.', submissionsEnabled: false }),
      ),
    ).toMatchObject({ ok: true });
    expect(await state.client!.appSettings.findUnique({ where: { id: 'default' } })).toMatchObject({
      submissionsEnabled: false,
    });
  });
  it('rejects a spoofed SVG image before any Storage request', async () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', 'local-test-only');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://not-a-real-project.invalid');
    const data = new FormData();
    data.set(
      'photo',
      new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], 'spoof.jpg', {
        type: 'image/jpeg',
      }),
    );
    expect(await uploadPhoto(facultyId, data)).toMatchObject({
      ok: false,
      message: 'The image content does not match its file type.',
    });
  });
  it('removes groups and their reports explicitly, then removes unreferenced records', async () => {
    expect(await deleteRecord('groups', groupId)).toMatchObject({ ok: true });
    expect(await state.client!.groupReport.count()).toBe(0);
    expect(await deleteRecord('sections', sectionId)).toMatchObject({ ok: true });
    expect(await state.client!.sectionSchedule.count()).toBe(0);
    expect(await deleteRecord('departments', departmentId)).toMatchObject({ ok: true });
    expect(
      (await state.client!.faculty.findUniqueOrThrow({ where: { id: facultyId } })).departmentId,
    ).toBeNull();
    expect(await deleteRecord('faculty', facultyId)).toMatchObject({ ok: true });
    expect(await deleteRecord('courses', courseId)).toMatchObject({ ok: true });
    expect(await deleteRecord('semesters', semesterId)).toMatchObject({ ok: true });
  });
});
