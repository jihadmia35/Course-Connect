import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import { saveGroup } from '@/lib/groups';

describe('invite locking across sections', () => {
  it('waits for the transaction lock before checking or writing records, and aliases share the lock', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tx = {
      $executeRaw: vi.fn().mockReturnValueOnce(gate).mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([]),
      courseSection: {
        findUnique: vi.fn().mockResolvedValue({ courseId: 'course', semesterId: 'term' }),
      },
      appSettings: { findUnique: vi.fn().mockResolvedValue(null) },
      messengerGroupLink: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'test-group' }),
      },
    };
    const client = {
      $transaction: (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaClient;
    const input = {
      courseId: 'course',
      semesterId: 'term',
      sectionId: 'section-a',
      url: 'https://m.me/j/SharedLockInvite',
      submitAnyway: true,
    };
    const first = saveGroup(client, input);
    await Promise.resolve();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.messengerGroupLink.findFirst).not.toHaveBeenCalled();
    expect(tx.messengerGroupLink.create).not.toHaveBeenCalled();
    release();
    await expect(first).resolves.toMatchObject({ status: 'created' });
    await saveGroup(client, {
      ...input,
      sectionId: 'section-b',
      url: 'https://www.messenger.com/j/SharedLockInvite/?send_source=gc%3Acopy_invite',
    });
    const firstKey = tx.$executeRaw.mock.calls[0]?.[1];
    expect(typeof firstKey).toBe('bigint');
    expect(tx.$executeRaw.mock.calls[1]?.[1]).toBe(firstKey);
    await saveGroup(client, { ...input, url: 'https://m.me/j/AnotherLockInvite' });
    expect(tx.$executeRaw.mock.calls[2]?.[1]).not.toBe(firstKey);
    expect(tx.messengerGroupLink.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      tx.messengerGroupLink.create.mock.invocationCallOrder[0],
    );
  });
});
