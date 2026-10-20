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
  requireAdminPage: async () => ({ id: '11111111-1111-4111-8111-111111111111' }),
}));
vi.mock('next/cache', async () => ({ ...(await import('./helpers/next-cache')).nextCache }));
const storage = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage: { from: () => storage } }),
}));
import sharp from 'sharp';
import { load } from 'cheerio';
import {
  saveRecord as persistRecord,
  deleteRecord as removeRecord,
  uploadPhoto as persistPhoto,
  runImport as persistImport,
} from '@/app/admin/actions';
import { getCatalog, getFacultyCatalog, getAdminCatalog } from '@/lib/catalog';
import { clearDataCache, nextCache } from './helpers/next-cache';
import { CATALOG_CACHE_TAG } from '@/lib/catalog-cache';
import AdminEntity from '@/app/admin/[entity]/page';

// Warm directory and profile views before EVERY mutation, then compare
// their next reads with fresh SQL. Covers all CRUD branches, imports and photos.
async function checkMutation(operation: () => ReturnType<typeof persistRecord>) {
  clearDataCache(); // Isolate raw SQL fixture setup from application writes.
  const before = await getCatalog();
  const facultyIds = before.faculty.map((f) => f.id);
  for (const id of facultyIds) await getFacultyCatalog(id);
  const calls = nextCache.updateTag.mock.calls.length;
  const result = await operation();
  expect(nextCache.updateTag.mock.calls.length - calls).toBe(result.ok ? 1 : 0);
  if (result.ok) expect(nextCache.updateTag).toHaveBeenLastCalledWith(CATALOG_CACHE_TAG);
  const fresh = await getAdminCatalog();
  expect(await getCatalog()).toEqual(fresh);
  for (const id of facultyIds) {
    const profile = await getFacultyCatalog(id);
    expect(profile.sections).toEqual(fresh.sections.filter((s) => s.facultyIds.includes(id)));
    expect(profile.faculty.find((f) => f.id === id)?.name).toBe(
      fresh.faculty.find((f) => f.id === id)?.name,
    );
    expect(profile.notice).toBe(fresh.notice);
    expect(profile.submissionsEnabled).toBe(fresh.submissionsEnabled);
    expect(profile.faculty.find((f) => f.id === id)?.photoUrl).toBe(
      fresh.faculty.find((f) => f.id === id)?.photoUrl,
    );
  }
  return result;
}
const saveRecord = (...args: Parameters<typeof persistRecord>) =>
  checkMutation(() => persistRecord(...args));
const deleteRecord = (...args: Parameters<typeof removeRecord>) =>
  checkMutation(() => removeRecord(...args));
const uploadPhoto = (...args: Parameters<typeof persistPhoto>) =>
  checkMutation(() => persistPhoto(...args));
const runImport = (...args: Parameters<typeof persistImport>) =>
  checkMutation(() => persistImport(...args));
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
  vi.stubEnv('DATABASE_URL', 'postgresql://disposable-test-only.invalid');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://not-a-real-project.invalid');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'local-test-only');
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
        form({ url: 'https://www.messenger.com/j/EditedTestInvite/?utm_source=admin' }),
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
  it('prevents admin edits from duplicating a legacy invite alias', async () => {
    const legacy = 'https://messenger.com/join/LegacyAdminInvite';
    const other = await state.client!.messengerGroupLink.create({
      data: { sectionId, url: legacy, normalizedUrl: legacy },
    });
    expect(
      await saveRecord(
        'groups',
        groupId,
        form({ url: 'https://messenger.com/j/LegacyAdminInvite' }),
      ),
    ).toMatchObject({ ok: false, message: 'This invite is already listed for this section.' });
    expect(
      (await state.client!.messengerGroupLink.findUniqueOrThrow({ where: { id: groupId } }))
        .normalizedUrl,
    ).toBe('https://m.me/j/EditedTestInvite');
    await state.client!.messengerGroupLink.delete({ where: { id: other.id } });
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
  it('refreshes names, courses, departments, schedules and derived profile counts after edits', async () => {
    expect(
      await saveRecord(
        'faculty',
        facultyId,
        form({ initials: 'FZC', name: 'Edited local test name', departmentId }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await saveRecord(
        'departments',
        departmentId,
        form({ code: 'TEST', name: 'Edited test department' }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await saveRecord(
        'courses',
        courseId,
        form({ code: 'ACT141', title: 'Edited local test title', credits: '3', departmentId }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await saveRecord(
        'sections',
        sectionId,
        form({
          courseId,
          semesterId,
          number: '1',
          availableSeats: '16',
          facultyIds: [],
          schedules: 'MON 10:00 11:20 TEST101',
        }),
      ),
    ).toMatchObject({ ok: true });
    expect((await getFacultyCatalog(facultyId)).sections).toHaveLength(0);
  });
  it('refreshes replaced photo URLs even if removing the old Storage object fails', async () => {
    storage.upload.mockResolvedValue({ error: null });
    storage.remove.mockRejectedValue(new Error('Synthetic cleanup outage'));
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    const data = new FormData();
    data.set('photo', new File([new Uint8Array(image)], 'test.png', { type: 'image/png' }));
    expect(await uploadPhoto(facultyId, data)).toMatchObject({ ok: true });
    const first = (await getCatalog()).faculty.find((f) => f.id === facultyId)!.photoUrl;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await uploadPhoto(facultyId, data)).toMatchObject({ ok: true });
      const second = (await getCatalog()).faculty.find((f) => f.id === facultyId)!.photoUrl;
      expect(second).not.toBe(first);
      expect(second).toMatch(/faculty-photos\/.+\.webp$/);
      expect(storage.remove).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith('Previous faculty photo cleanup failed');
    } finally {
      log.mockRestore();
    }
  });
  it('expires cached assignments, names, meetings and courses after a web HTML import', async () => {
    const $ = load(readFileSync('tests/fixtures/advising.html', 'utf8'));
    const row = $('.ums-grid-offered-section').first().prop('outerHTML')!;
    const data = new FormData();
    data.set('semesterId', semesterId);
    data.set('html', new File([row], 'cache-test.html', { type: 'text/html' }));
    expect(await runImport(data)).toMatchObject({ ok: true, summary: { updated: 1 } });
    const profile = await getFacultyCatalog(facultyId);
    expect(profile.sections).toHaveLength(1);
    expect(profile.faculty[0]?.name).toBe('Dr. Faieza Chowdhury');
    expect(profile.courses[0]?.title).toBe('Introduction to Accounting');
    expect(profile.sections[0]?.groups).toHaveLength(1);
    // Remove the disposable audit row to allow the final semester deletion test.
    await state.client!.importHistory.deleteMany();
  });
  it('lists submissions newest first with original timestamps, even after editing an older URL', async () => {
    const client = state.client!;
    const original = await client.messengerGroupLink.findUniqueOrThrow({ where: { id: groupId } });
    await client.messengerGroupLink.update({
      where: { id: groupId },
      data: { createdAt: new Date('2026-10-19T19:00:00Z') },
    });
    const older = await client.messengerGroupLink.create({
      data: {
        sectionId,
        url: 'https://m.me/j/OlderAdminListInvite',
        normalizedUrl: 'https://m.me/j/OlderAdminListInvite',
        createdAt: new Date('2026-10-18T18:00:00Z'),
      },
    });
    const latest = await client.messengerGroupLink.create({
      data: {
        sectionId,
        url: 'https://m.me/j/LatestAdminListInvite',
        normalizedUrl: 'https://m.me/j/LatestAdminListInvite',
        createdAt: new Date('2026-10-20T06:00:00Z'),
      },
    });
    try {
      expect(
        await saveRecord('groups', older.id, form({ url: 'https://m.me/j/EditedOlderListInvite' })),
      ).toMatchObject({ ok: true });
      const result = await AdminEntity({ params: Promise.resolve({ entity: 'groups' }) });
      const records = result.props.records as { id: string; createdAt: string }[];
      expect(records.map((r) => r.id)).toEqual([latest.id, groupId, older.id]);
      expect(records[0]?.createdAt).toBe('2026-10-20T06:00:00.000Z');
      expect(records[2]?.createdAt).toBe('2026-10-18T18:00:00.000Z');
    } finally {
      await client.messengerGroupLink.deleteMany({ where: { id: { in: [older.id, latest.id] } } });
      await client.messengerGroupLink.update({
        where: { id: groupId },
        data: { createdAt: original.createdAt },
      });
    }
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
