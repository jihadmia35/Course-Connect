import { migrationNames } from '../scripts/migration-files';
import { load } from 'cheerio';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { importHtml } from '@/lib/importer';
import { saveGroup } from '@/lib/groups';
import { getCatalog, getFacultyCatalog } from '@/lib/catalog';
import { runtimeDatabaseConfig } from '@/lib/database-config';
vi.mock('@/lib/db', () => ({ db: () => client }));
// These tests deliberately mutate SQL directly; exercise fresh relational reads.
vi.mock('next/cache', () => ({
  unstable_cache: (callback: (...args: unknown[]) => unknown) => callback,
}));
const html = readFileSync('tests/fixtures/advising.html', 'utf8'),
  adminId = '11111111-1111-4111-8111-111111111111';
let engine: PGlite,
  server: PGLiteSocketServer,
  client: PrismaClient,
  semesterId: string,
  courseId: string,
  sectionId: string;
function makeClient() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`,
      max: 1,
    }),
  });
}
async function reconnectAfterConstraint() {
  // PGlite's socket transport can close a connection after a deliberate SQL error.
  // Reopen the test pool; production uses a real PostgreSQL server.
  await client.$disconnect();
  client = makeClient();
}
beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://disposable-test-only.invalid');
  engine = await PGlite.create();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  for (const name of migrationNames())
    await engine.exec(readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8'));
  server = new PGLiteSocketServer({ db: engine, port: 0, host: '127.0.0.1', maxConnections: 4 });
  await server.start();
  client = makeClient();
  semesterId = (await client.semester.create({ data: { name: 'TEST TERM A' } })).id;
});
afterAll(async () => {
  await client?.$disconnect();
  await server?.stop();
  await engine?.close();
  vi.unstubAllEnvs();
});
describe('PostgreSQL migration and core workflows', () => {
  it('inserts all advising data and preserves normalized relationships', async () => {
    const summary = await importHtml(client, html, semesterId, adminId, 'fixture.html');
    expect(summary).toMatchObject({ inserted: 496, updated: 0, skipped: 0, invalid: 0 });
    expect(await client.course.count()).toBe(69);
    expect(await client.faculty.count()).toBe(122);
    expect(await client.sectionSchedule.count()).toBe(796);
    const section = await client.courseSection.findFirstOrThrow({
      where: { number: '1', course: { code: 'ACT141' } },
      include: { assignments: { include: { faculty: true } }, course: true },
    });
    expect(section.assignments[0]?.faculty.initials).toBe('FZC');
    sectionId = section.id;
    courseId = section.courseId;
  });
  it('reimports idempotently without duplicate courses, sections, faculty or schedules', async () => {
    expect(await importHtml(client, html, semesterId, adminId, 'repeat.html')).toMatchObject({
      inserted: 0,
      updated: 0,
      skipped: 496,
    });
    expect(await client.courseSection.count()).toBe(496);
    expect(await client.sectionSchedule.count()).toBe(796);
  });
  it('returns only the selected faculty’s courses and sections, preserving real profile counts', async () => {
    const faculty = await client.faculty.findUniqueOrThrow({ where: { initials: 'FZC' } });
    const profile = await getFacultyCatalog(faculty.id);
    expect(profile.faculty.map((f) => f.initials)).toEqual(['FZC']);
    expect(profile.faculty[0]).toMatchObject({ courses: 1, sections: 2 });
    expect(profile.courses.map((c) => c.code)).toEqual(['ACT141']);
    expect(profile.sections).toHaveLength(2);
    expect(profile.sections.every((s) => s.facultyIds.includes(faculty.id))).toBe(true);
    expect(profile.semesters.map((s) => s.id)).toContain(semesterId);
    const directory = await getCatalog();
    expect(directory.faculty).toHaveLength(122);
    expect(directory.sections).toHaveLength(496);
    expect(directory.faculty.find((f) => f.id === faculty.id)).toMatchObject({
      courses: 1,
      sections: 2,
    });
    expect((await getFacultyCatalog('nonexistent-faculty')).faculty).toHaveLength(0);
  });
  it('avoids the one-connection checkout timeout while another request holds a connection', async () => {
    const connectionString = `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`;
    const single = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 100 });
    const held = await single.connect();
    try {
      await expect(single.query('SELECT 1')).rejects.toThrow(
        'timeout exceeded when trying to connect',
      );
    } finally {
      held.release();
      await single.end();
    }
    const shared = new Pool({
      ...runtimeDatabaseConfig(connectionString, true),
      connectionTimeoutMillis: 2000,
    });
    const occupied = await shared.connect();
    try {
      expect((await shared.query('SELECT 1 AS available')).rows[0].available).toBe(1);
    } finally {
      occupied.release();
      await shared.end();
    }
  });
  it('preserves co-teachers in a scoped faculty profile', async () => {
    const faculty = await client.faculty.findUniqueOrThrow({ where: { initials: 'FZC' } });
    const coTeacher = await client.faculty.create({
      data: { initials: 'TESTCO', name: 'Synthetic test co-teacher' },
    });
    try {
      await client.teachingAssignment.create({ data: { sectionId, facultyId: coTeacher.id } });
      const profile = await getFacultyCatalog(faculty.id);
      expect(profile.faculty.map((f) => f.id)).toEqual(
        expect.arrayContaining([faculty.id, coTeacher.id]),
      );
      expect(profile.sections.find((s) => s.id === sectionId)?.facultyIds).toContain(coTeacher.id);
      expect(profile.faculty.find((f) => f.id === faculty.id)).toMatchObject({
        courses: 1,
        sections: 2,
      });
    } finally {
      await client.teachingAssignment.deleteMany({ where: { facultyId: coTeacher.id } });
      await client.faculty.delete({ where: { id: coTeacher.id } });
    }
  });
  it('updates changed rows and replaces meetings without touching other sections', async () => {
    const changed = html.replace('SUN # 08:30 ~ 09:50 @ SEU516', 'SUN # 08:30 ~ 09:50 @ TESTROOM');
    expect(await importHtml(client, changed, semesterId, adminId, 'changed.html')).toMatchObject({
      inserted: 0,
      updated: 1,
      skipped: 495,
    });
    expect(await client.sectionSchedule.count()).toBe(796);
    expect(await client.sectionSchedule.count({ where: { room: 'TESTROOM' } })).toBe(1);
  });
  it('creates the first group without authentication', async () => {
    const result = await saveGroup(client, {
      sectionId,
      courseId,
      semesterId,
      url: 'https://m.me/j/FirstInvite',
      submitAnyway: false,
    });
    expect(result.status).toBe('created');
  });
  it('warns before saving another distinct group', async () => {
    const result = await saveGroup(client, {
      sectionId,
      courseId,
      semesterId,
      url: 'https://m.me/j/SecondInvite',
      submitAnyway: false,
    });
    expect(result.status).toBe('warning');
    expect(await client.messengerGroupLink.count()).toBe(1);
  });
  it('Submit Anyway allows multiple distinct groups', async () => {
    expect(
      (
        await saveGroup(client, {
          sectionId,
          courseId,
          semesterId,
          url: 'https://m.me/j/SecondInvite',
          submitAnyway: true,
        })
      ).status,
    ).toBe('created');
    expect(await client.messengerGroupLink.count()).toBe(2);
  });
  it('rechecks normalized exact duplicates even with Submit Anyway', async () => {
    expect(
      (
        await saveGroup(client, {
          sectionId,
          courseId,
          semesterId,
          url: 'https://www.messenger.com/j/SecondInvite/?send_source=gc%3Acopy_invite&utm_source=duplicate',
          submitAnyway: true,
        })
      ).status,
    ).toBe('duplicate');
    expect(await client.messengerGroupLink.count()).toBe(2);
  });
  it('uses database uniqueness even if the application is bypassed', async () => {
    await expect(
      client.messengerGroupLink.create({
        data: {
          sectionId,
          url: 'https://m.me/j/FirstInvite',
          normalizedUrl: 'https://m.me/j/FirstInvite',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await reconnectAfterConstraint();
  });
  it('blocks reusing an invite in another section, including aliases and Submit Anyway', async () => {
    const other = await client.courseSection.findFirstOrThrow({
      where: { semesterId, courseId, number: '2' },
    });
    for (const submitAnyway of [false, true])
      for (const url of [
        'https://m.me/j/FirstInvite',
        'https://www.messenger.com/j/FirstInvite/?send_source=gc%3Acopy_invite',
        'https://messenger.com/join/FirstInvite',
      ])
        await expect(
          saveGroup(client, { sectionId: other.id, courseId, semesterId, url, submitAnyway }),
        ).rejects.toMatchObject({
          code: 'INVITE_USED_IN_ANOTHER_SECTION',
          message: expect.stringContaining('ACT141.1 (TEST TERM A)'),
        });
    expect(await client.messengerGroupLink.count({ where: { sectionId: other.id } })).toBe(0);
    expect(await client.messengerGroupLink.count()).toBe(2);
    const anotherCourse = await client.courseSection.findFirstOrThrow({
      where: { semesterId, course: { code: 'CSE141' }, number: '1' },
    });
    await expect(
      saveGroup(client, {
        sectionId: anotherCourse.id,
        courseId: anotherCourse.courseId,
        semesterId,
        url: 'https://m.me/j/FirstInvite',
        submitAnyway: true,
      }),
    ).rejects.toMatchObject({ code: 'INVITE_USED_IN_ANOTHER_SECTION' });
    const distinct = await saveGroup(client, {
      sectionId: other.id,
      courseId,
      semesterId,
      url: 'https://m.me/j/OtherSectionInvite',
      submitAnyway: true,
    });
    expect(distinct.status).toBe('created');
    if (distinct.status === 'created')
      await client.messengerGroupLink.delete({ where: { id: distinct.id } });
  });
  it('keeps semester assignments and groups isolated while reusing courses and faculty', async () => {
    const other = await client.semester.create({ data: { name: 'TEST TERM B' } });
    const row = load(html)('.ums-grid-offered-section').first().toString();
    await importHtml(client, row, other.id, adminId, 'term-b.html');
    expect(await client.course.count()).toBe(69);
    expect(await client.faculty.count()).toBe(122);
    const section = await client.courseSection.findFirstOrThrow({
      where: { semesterId: other.id },
    });
    expect(await client.messengerGroupLink.count({ where: { sectionId: section.id } })).toBe(0);
    await expect(
      saveGroup(client, {
        sectionId: section.id,
        courseId,
        semesterId: other.id,
        url: 'https://m.me/j/FirstInvite',
        submitAnyway: true,
      }),
    ).rejects.toMatchObject({ code: 'INVITE_USED_IN_ANOTHER_SECTION' });
    const facultyId = (
      await client.teachingAssignment.findFirstOrThrow({ where: { sectionId: section.id } })
    ).facultyId;
    const profile = await getFacultyCatalog(facultyId);
    expect(profile.sections.filter((s) => s.semesterId === semesterId)).toHaveLength(2);
    expect(profile.sections.filter((s) => s.semesterId === other.id)).toHaveLength(1);
    await expect(
      saveGroup(client, {
        sectionId,
        courseId,
        semesterId: other.id,
        url: 'https://m.me/j/ThirdInvite',
        submitAnyway: true,
      }),
    ).rejects.toThrow('does not belong');
  });
  it('preserves groups across imports and prevents accidental cascade deletion', async () => {
    await importHtml(client, html, semesterId, adminId, 'restore.html');
    expect(await client.messengerGroupLink.count()).toBe(2);
    await expect(client.courseSection.delete({ where: { id: sectionId } })).rejects.toMatchObject({
      code: 'P2003',
    });
    await reconnectAfterConstraint();
    await expect(client.course.delete({ where: { id: courseId } })).rejects.toMatchObject({
      code: 'P2003',
    });
    await reconnectAfterConstraint();
  });
  it('honors the public submission pause server-side', async () => {
    await client.appSettings.create({ data: { submissionsEnabled: false } });
    await expect(
      saveGroup(client, {
        sectionId,
        courseId,
        semesterId,
        url: 'https://m.me/j/ThirdInvite',
        submitAnyway: true,
      }),
    ).rejects.toThrow('paused');
  });
  it('audits a trusted database-operator import without inventing an admin account', async () => {
    const result = await importHtml(client, html, semesterId, null, 'operator-fixture.html');
    expect(result).toMatchObject({ inserted: 0, updated: 0, skipped: 496, invalid: 0 });
    const history = await client.importHistory.findFirstOrThrow({
      where: { fileName: 'operator-fixture.html' },
    });
    expect(history.adminId).toBeNull();
    expect(history.databaseRole).toEqual(expect.any(String));
    expect(await client.adminUser.count()).toBe(0);
  });
  it('has RLS enabled and no anonymous data access policies', async () => {
    const tables = await engine.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname='AdminUser'`,
    );
    expect(tables.rows[0]?.relrowsecurity).toBe(true);
    const policies = await engine.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_policies WHERE schemaname='public'",
    );
    expect(policies.rows[0]?.count).toBe(0);
    await expect(engine.exec('SET ROLE anon; SELECT * FROM "AdminUser";')).rejects.toThrow();
    await engine.exec('RESET ROLE;');
  });
  it('detects legacy host aliases without modifying existing records or database constraints', async () => {
    await client.appSettings.update({
      where: { id: 'default' },
      data: { submissionsEnabled: true },
    });
    const legacy = 'https://messenger.com/join/LegacyInviteToken';
    const group = await client.messengerGroupLink.create({
      data: { sectionId, url: legacy, normalizedUrl: legacy },
    });
    for (const url of [
      'https://m.me/j/LegacyInviteToken',
      'https://www.messenger.com/j/LegacyInviteToken/',
    ]) {
      expect(
        await saveGroup(client, { sectionId, courseId, semesterId, url, submitAnyway: true }),
      ).toEqual({ status: 'duplicate', id: group.id });
    }
    expect(
      await client.messengerGroupLink.findUniqueOrThrow({ where: { id: group.id } }),
    ).toMatchObject({ url: legacy, normalizedUrl: legacy });
    const other = await client.courseSection.findFirstOrThrow({
      where: { semesterId, courseId, number: '2' },
    });
    await expect(
      saveGroup(client, {
        sectionId: other.id,
        courseId,
        semesterId,
        url: 'https://www.messenger.com/j/LegacyInviteToken/',
        submitAnyway: true,
      }),
    ).rejects.toMatchObject({ code: 'INVITE_USED_IN_ANOTHER_SECTION' });
  });
  it('retains the ordinary eight-attempt limit for different invites within fifteen minutes', async () => {
    vi.stubEnv('RATE_LIMIT_SECRET', 'disposable-database-short-limit-tests-only');
    vi.stubEnv('VERCEL', '1');
    const { rateLimit } = await import('@/lib/security');
    const headers = new Headers({ 'x-forwarded-for': '198.51.100.44' });
    for (let i = 0; i < 8; i++) await rateLimit(headers, 'groups');
    await expect(rateLimit(headers, 'groups')).rejects.toThrow('15 minutes');
  });
  it('persists a ten-day ban on the third equivalent attempt, survives a cold instance, and expires automatically', async () => {
    vi.stubEnv('RATE_LIMIT_SECRET', 'disposable-database-abuse-tests-only');
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    const now = Date.parse('2026-10-21T10:00:00Z');
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const headers = new Headers({ 'x-forwarded-for': '198.51.100.21' });
    const other = new Headers({ 'x-forwarded-for': '198.51.100.22' });
    const { assertGroupSubmissionAllowed, recordInviteAttempt } = await import('@/lib/group-abuse');
    const groupCount = await client.messengerGroupLink.count();
    try {
      await assertGroupSubmissionAllowed(headers);
      expect(
        await recordInviteAttempt(headers, 'https://m.me/j/PersistentBanInvite'),
      ).toMatchObject({ inviteAttempts: 1, attemptsRemaining: 2 });
      // A different invite has its own allowance; successful/valid attempts count too.
      expect(await recordInviteAttempt(headers, 'https://m.me/j/DifferentInvite')).toMatchObject({
        inviteAttempts: 1,
      });
      expect(
        await recordInviteAttempt(headers, 'https://messenger.com/join/PersistentBanInvite'),
      ).toMatchObject({ inviteAttempts: 2, attemptsRemaining: 1 });
      await expect(
        recordInviteAttempt(
          headers,
          'https://www.messenger.com/j/PersistentBanInvite/?send_source=gc%3Acopy_invite',
        ),
      ).rejects.toMatchObject({
        code: 'GROUP_SUBMISSIONS_BLOCKED',
        blockedUntil: new Date(now + 864000000).toISOString(),
      });
      const spy = vi.spyOn(client.rateLimitBucket, 'findUnique');
      await expect(assertGroupSubmissionAllowed(headers)).rejects.toMatchObject({
        code: 'GROUP_SUBMISSIONS_BLOCKED',
      });
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
      // Reload the module to discard all local denial memory, as a new Vercel instance would.
      vi.resetModules();
      const cold = await import('@/lib/group-abuse');
      clock.mockReturnValue(now + 1000);
      await expect(cold.assertGroupSubmissionAllowed(headers)).rejects.toMatchObject({
        blockedUntil: new Date(now + 864000000).toISOString(),
        retryAfterSeconds: 863999,
      });
      await cold.assertGroupSubmissionAllowed(other);
      expect(
        await cold.recordInviteAttempt(other, 'https://m.me/j/PersistentBanInvite'),
      ).toMatchObject({ inviteAttempts: 1 });
      // Retrying cannot extend the original ban.
      await expect(
        cold.recordInviteAttempt(headers, 'https://m.me/j/PersistentBanInvite'),
      ).rejects.toMatchObject({
        blockedUntil: new Date(now + 864000000).toISOString(),
      });
      clock.mockReturnValue(now + 864000000);
      await cold.assertGroupSubmissionAllowed(headers);
      expect(
        await cold.recordInviteAttempt(headers, 'https://m.me/j/PersistentBanInvite'),
      ).toMatchObject({ inviteAttempts: 1 });
      expect(await client.messengerGroupLink.count()).toBe(groupCount);
    } finally {
      clock.mockRestore();
    }
  });
});
