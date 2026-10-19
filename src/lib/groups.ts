import type { PrismaClient } from '@/generated/prisma/client';
import { normalizeMessengerUrl } from './validation';
export type GroupResult =
  | { status: 'created' | 'duplicate'; id: string }
  | { status: 'warning'; groups: { id: string; url: string }[] };
export async function saveGroup(
  client: PrismaClient,
  input: {
    semesterId: string;
    courseId: string;
    sectionId: string;
    url: string;
    submitAnyway: boolean;
  },
): Promise<GroupResult> {
  const normalizedUrl = normalizeMessengerUrl(input.url);
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CourseSection" WHERE id = ${input.sectionId} FOR UPDATE`;
    const section = await tx.courseSection.findUnique({ where: { id: input.sectionId } });
    if (!section || section.courseId !== input.courseId || section.semesterId !== input.semesterId)
      throw new Error('Section does not belong to the selected course and semester.');
    const settings = await tx.appSettings.findUnique({ where: { id: 'default' } });
    if (settings && !settings.submissionsEnabled)
      throw new Error('Submissions are currently paused.');
    const groups = await tx.messengerGroupLink.findMany({
      where: { sectionId: input.sectionId },
      select: { id: true, url: true, normalizedUrl: true },
    });
    const duplicate = groups.find((g) => normalizeMessengerUrl(g.normalizedUrl) === normalizedUrl);
    if (duplicate) return { status: 'duplicate', id: duplicate.id };
    if (groups.length && !input.submitAnyway)
      return { status: 'warning', groups: groups.map(({ id, url }) => ({ id, url })) };
    const group = await tx.messengerGroupLink.create({
      data: { sectionId: input.sectionId, url: normalizedUrl, normalizedUrl },
    });
    return { status: 'created', id: group.id };
  });
}
