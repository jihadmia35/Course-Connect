'use server';
import { z } from 'zod';
import { invalidateCatalogAction } from '@/lib/catalog-cache';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { meetingSchema } from '@/lib/parser';
import { normalizeMessengerUrl } from '@/lib/validation';
import { InviteResolutionError, resolveMessengerInvite } from '@/lib/resolve-invite';
import { importHtml } from '@/lib/importer';
import {
  assertInviteSection,
  GroupLinkConflictError,
  lockGroupInvite,
} from '@/lib/group-link-policy';
const text = (max = 160) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^<>\x00-\x1f]+$/, 'Use plain text without control characters or HTML.');
const optionalId = z
  .string()
  .max(100)
  .transform((s) => s || null);
export type MutationResult = { ok: boolean; message: string; summary?: unknown };
function failure(error: unknown): MutationResult {
  if (error instanceof InviteResolutionError || error instanceof GroupLinkConflictError)
    return { ok: false, message: error.message };
  if (error instanceof z.ZodError)
    return { ok: false, message: error.issues[0]?.message ?? 'Check the form fields.' };
  const e = error as { code?: string; message?: string };
  if (e.code === 'P2002')
    return { ok: false, message: 'A record with this unique value already exists.' };
  if (e.code === 'P2003')
    return {
      ok: false,
      message:
        'This record is still referenced. Remove its dependent records or reassign them first.',
    };
  if (e.code === 'P2025')
    return { ok: false, message: 'This record no longer exists. Refresh and try again.' };
  if (e.message === 'Administrator authorization required.')
    return { ok: false, message: e.message };
  console.error('Admin operation failed', { code: e.code ?? 'unknown' });
  return {
    ok: false,
    message: 'Could not save this change. Check the input and service configuration.',
  };
}
export async function saveRecord(
  entity: string,
  id: string,
  form: FormData,
): Promise<MutationResult> {
  try {
    await requireAdmin();
    const client = db();
    const get = (k: string) => String(form.get(k) ?? '');
    if (id) z.string().max(100).parse(id);
    if (entity === 'departments') {
      const data = z
        .object({ code: text(20).regex(/^[A-Z0-9-]+$/), name: text() })
        .parse({ code: get('code'), name: get('name') });
      if (id) await client.department.update({ where: { id }, data });
      else await client.department.create({ data });
    } else if (entity === 'faculty') {
      const data = z
        .object({ initials: text(20).regex(/^[A-Z0-9]+$/), name: text(), departmentId: optionalId })
        .parse({ initials: get('initials'), name: get('name'), departmentId: get('departmentId') });
      if (id) await client.faculty.update({ where: { id }, data });
      else await client.faculty.create({ data });
    } else if (entity === 'courses') {
      const data = z
        .object({
          code: text(20).regex(/^[A-Z]+\d+[A-Z]?$/),
          title: text(250),
          credits: z.coerce.number().min(0).max(30),
          departmentId: optionalId,
        })
        .parse({
          code: get('code'),
          title: get('title'),
          credits: get('credits'),
          departmentId: get('departmentId'),
        });
      if (id) await client.course.update({ where: { id }, data });
      else await client.course.create({ data });
    } else if (entity === 'semesters') {
      const data = z
        .object({
          name: text(80),
          isActive: z.boolean(),
          startsAt: z
            .string()
            .refine((s) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s), 'Choose a valid date')
            .transform((s) => (s ? new Date(s) : null)),
        })
        .parse({
          name: get('name'),
          isActive: get('isActive') === 'on',
          startsAt: get('startsAt'),
        });
      await client.$transaction(async (tx) => {
        if (data.isActive)
          await tx.semester.updateMany({ where: { isActive: true }, data: { isActive: false } });
        if (id) await tx.semester.update({ where: { id }, data });
        else await tx.semester.create({ data });
      });
    } else if (entity === 'sections') {
      const data = z
        .object({
          courseId: text(100),
          semesterId: text(100),
          number: text(20).regex(/^[\w-]+$/),
          availableSeats: z
            .union([z.literal(''), z.coerce.number().int().min(0).max(10000)])
            .transform((s) => (s === '' ? null : s)),
          facultyIds: z.array(z.string().min(1).max(100)).max(20),
          schedules: z.string().max(4000),
        })
        .parse({
          courseId: get('courseId'),
          semesterId: get('semesterId'),
          number: get('number'),
          availableSeats: get('availableSeats'),
          facultyIds: form.getAll('facultyIds').map(String),
          schedules: get('schedules'),
        });
      const schedules = data.schedules
        .split('\n')
        .filter((x) => x.trim())
        .map((line) => {
          const [day, startTime, endTime, ...room] = line.trim().split(/\s+/);
          return meetingSchema.parse({ day, startTime, endTime, room: room.join(' ') });
        });
      await client.$transaction(async (tx) => {
        if (id) {
          await tx.$queryRaw`SELECT id FROM "CourseSection" WHERE id = ${id} FOR UPDATE`;
          const old = await tx.courseSection.findUniqueOrThrow({
            where: { id },
            include: { _count: { select: { groups: true } } },
          });
          if (
            old._count.groups &&
            (old.courseId !== data.courseId ||
              old.semesterId !== data.semesterId ||
              old.number !== data.number)
          )
            throw new z.ZodError([
              {
                code: 'custom',
                path: ['courseId'],
                message:
                  'A section with groups cannot be moved or renumbered. Create a new section.',
              },
            ]);
        }
        const values = {
          courseId: data.courseId,
          semesterId: data.semesterId,
          number: data.number,
          availableSeats: data.availableSeats,
          sourceHash: null,
        };
        const section = id
          ? await tx.courseSection.update({ where: { id }, data: values })
          : await tx.courseSection.create({ data: values });
        await tx.teachingAssignment.deleteMany({ where: { sectionId: section.id } });
        await tx.sectionSchedule.deleteMany({ where: { sectionId: section.id } });
        await tx.teachingAssignment.createMany({
          data: [...new Set(data.facultyIds)].map((facultyId) => ({
            sectionId: section.id,
            facultyId,
          })),
        });
        await tx.sectionSchedule.createMany({
          data: schedules.map((s) => ({ ...s, sectionId: section.id })),
          skipDuplicates: true,
        });
      });
    } else if (entity === 'groups') {
      if (!id) throw new Error('Use the public submission workflow.');
      const normalizedUrl = await resolveMessengerInvite(get('url'));
      await client.$transaction(async (tx) => {
        await lockGroupInvite(tx, normalizedUrl);
        const group = await tx.messengerGroupLink.findUniqueOrThrow({ where: { id } });
        await tx.$queryRaw`SELECT id FROM "CourseSection" WHERE id = ${group.sectionId} FOR UPDATE`;
        await assertInviteSection(tx, normalizedUrl, group.sectionId);
        const others = await tx.messengerGroupLink.findMany({
          where: { sectionId: group.sectionId, id: { not: id } },
          select: { normalizedUrl: true },
        });
        if (others.some((g) => normalizeMessengerUrl(g.normalizedUrl) === normalizedUrl))
          throw new InviteResolutionError('This invite is already listed for this section.');
        await tx.messengerGroupLink.update({
          where: { id },
          data: { url: normalizedUrl, normalizedUrl },
        });
      });
    } else if (entity === 'reports') {
      if (!id) throw new Error('Report required');
      await client.groupReport.update({
        where: { id },
        data: { resolved: get('resolved') === 'on' },
      });
    } else if (entity === 'settings') {
      const data = z
        .object({
          notice: z
            .string()
            .trim()
            .max(500)
            .regex(/^[^<>\x00-\x1f]*$/),
          submissionsEnabled: z.boolean(),
        })
        .parse({ notice: get('notice'), submissionsEnabled: get('submissionsEnabled') === 'on' });
      await client.appSettings.upsert({
        where: { id: 'default' },
        create: { id: 'default', ...data },
        update: data,
      });
    } else throw new Error('Unknown entity');
    invalidateCatalogAction();
    return { ok: true, message: 'Changes saved.' };
  } catch (error) {
    return failure(error);
  }
}
export async function deleteRecord(entity: string, id: string): Promise<MutationResult> {
  try {
    await requireAdmin();
    z.string().min(1).max(100).parse(id);
    const client = db();
    switch (entity) {
      case 'faculty':
        await client.faculty.delete({ where: { id } });
        break;
      case 'courses':
        await client.course.delete({ where: { id } });
        break;
      case 'departments':
        await client.department.delete({ where: { id } });
        break;
      case 'semesters':
        await client.semester.delete({ where: { id } });
        break;
      case 'sections':
        await client.courseSection.delete({ where: { id } });
        break;
      case 'groups':
        await client.messengerGroupLink.delete({ where: { id } });
        break;
      case 'reports':
        await client.groupReport.delete({ where: { id } });
        break;
      default:
        throw new Error('Unsupported deletion');
    }
    invalidateCatalogAction();
    return { ok: true, message: 'Record removed.' };
  } catch (error) {
    return failure(error);
  }
}
export async function uploadPhoto(facultyId: string, form: FormData): Promise<MutationResult> {
  try {
    await requireAdmin();
    if (!process.env.SUPABASE_SECRET_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL)
      return {
        ok: false,
        message: 'Configure the server-only Supabase secret key to upload photos.',
      };
    const faculty = await db().faculty.findUniqueOrThrow({ where: { id: facultyId } });
    const file = form.get('photo');
    if (
      !(file instanceof File) ||
      file.size > 2 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    )
      return { ok: false, message: 'Choose a JPEG, PNG, or WebP image up to 2 MB.' };
    const original = Buffer.from(await file.arrayBuffer());
    const actualType = original.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      ? 'image/jpeg'
      : original
            .subarray(0, 8)
            .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        ? 'image/png'
        : original.subarray(0, 4).toString() === 'RIFF' &&
            original.subarray(8, 12).toString() === 'WEBP'
          ? 'image/webp'
          : null;
    if (!actualType || actualType !== file.type)
      return { ok: false, message: 'The image content does not match its file type.' };
    const buffer = await sharp(original, {
      limitInputPixels: 16000000,
      animated: false,
    })
      .rotate()
      .resize(512, 512, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();
    const storage = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    ).storage.from('faculty-photos');
    const path = `${faculty.id}/${randomUUID()}.webp`;
    const result = await storage.upload(path, buffer, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    });
    if (result.error) throw result.error;
    try {
      await db().faculty.update({ where: { id: faculty.id }, data: { photoPath: path } });
    } catch (error) {
      await storage.remove([path]);
      throw error;
    }
    invalidateCatalogAction();
    if (faculty.photoPath) {
      try {
        const cleanup = await storage.remove([faculty.photoPath]);
        if (cleanup.error) console.error('Previous faculty photo cleanup failed');
      } catch {
        // The new photo is already committed and visible. Cleanup must not turn
        // a successful update into an error or prevent cache invalidation.
        console.error('Previous faculty photo cleanup failed');
      }
    }
    return { ok: true, message: 'Faculty photo updated.' };
  } catch (error) {
    return failure(error);
  }
}
export async function runImport(form: FormData): Promise<MutationResult> {
  try {
    const admin = await requireAdmin();
    const semesterId = z.string().min(1).max(100).parse(form.get('semesterId'));
    const file = form.get('html');
    if (
      !(file instanceof File) ||
      file.size > 3 * 1024 * 1024 ||
      !file.name.toLowerCase().endsWith('.html')
    )
      return { ok: false, message: 'Choose an HTML file up to 3 MB.' };
    const html = await file.text();
    const summary = await importHtml(
      db(),
      html,
      semesterId,
      admin.id,
      file.name.replace(/[^\w. -]/g, '').slice(0, 150),
    );
    invalidateCatalogAction();
    return { ok: true, message: 'Import completed.', summary };
  } catch (error) {
    return failure(error);
  }
}
