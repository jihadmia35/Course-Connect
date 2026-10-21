import 'server-only';
import { createHash } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';

export class GroupLinkConflictError extends Error {
  readonly code = 'INVITE_USED_IN_ANOTHER_SECTION';

  constructor(section: { number: string; course: { code: string }; semester: { name: string } }) {
    super(
      `This invite is already listed for ${section.course.code}.${section.number} (${section.semester.name}). ` +
        'The same invite cannot be shared across multiple sections. Please use a different group link.',
    );
    this.name = 'GroupLinkConflictError';
  }
}

/** Acquire before the section row lock, using the canonical invite URL. */
export async function lockGroupInvite(tx: Prisma.TransactionClient, normalizedUrl: string) {
  const key = createHash('sha256')
    .update(`seu:group-invite:v1:${normalizedUrl}`)
    .digest()
    .readBigInt64BE();
  // A transaction-scoped lock works across Vercel instances and releases on
  // commit/rollback. Different sections cannot race to claim the same invite.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
}

export async function assertInviteSection(
  tx: Prisma.TransactionClient,
  normalizedUrl: string,
  sectionId: string,
) {
  const token = normalizedUrl.slice('https://m.me/j/'.length);
  // These are the two stored forms permitted by the existing SQL constraint.
  // New submissions always use the canonical form; retain legacy compatibility.
  const existing = await tx.messengerGroupLink.findFirst({
    where: {
      sectionId: { not: sectionId },
      normalizedUrl: { in: [normalizedUrl, `https://messenger.com/join/${token}`] },
    },
    select: {
      section: {
        select: {
          number: true,
          course: { select: { code: true } },
          semester: { select: { name: true } },
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  if (existing) throw new GroupLinkConflictError(existing.section);
}
