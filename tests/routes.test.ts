import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  db: vi.fn(),
  saveGroup: vi.fn(),
  resolve: vi.fn(),
  abuseCheck: vi.fn(),
  inviteAttempt: vi.fn(),
}));
vi.mock('@/lib/group-abuse', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/group-abuse')>()),
  assertGroupSubmissionAllowed: mocks.abuseCheck,
  recordInviteAttempt: mocks.inviteAttempt,
}));
vi.mock('@/lib/resolve-invite', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/resolve-invite')>()),
  resolveMessengerInvite: mocks.resolve,
}));
vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/security', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security')>()),
  rateLimit: mocks.rateLimit,
}));
vi.mock('@/lib/groups', () => ({ saveGroup: mocks.saveGroup }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
import { revalidateTag, revalidatePath } from 'next/cache';
import { CATALOG_CACHE_TAG } from '@/lib/catalog-cache';
import { POST as groupPost } from '@/app/api/groups/route';
import { POST as reportPost } from '@/app/api/reports/route';
import { GET as challengeGet } from '@/app/api/challenge/route';
import { issueToken } from '@/lib/security';
import { InviteResolutionError } from '@/lib/resolve-invite';
import { GroupLinkConflictError } from '@/lib/group-link-policy';
import { GroupSubmissionBlockedError, GroupAbuseUnavailableError } from '@/lib/group-abuse';
const origin = 'https://deployment-test.invalid';
function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(origin + path, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
function validGroup() {
  const token = issueToken();
  vi.advanceTimersByTime(2100);
  return {
    semesterId: 'semester',
    courseId: 'course',
    sectionId: 'section',
    url: 'https://m.me/j/RouteTestInvite',
    token,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.inviteAttempt.mockResolvedValue({
    inviteAttempts: 1,
    attemptsRemaining: 2,
    warning:
      'This invite has been submitted 1 of 3 times. Repeating it 2 more times will block group submissions for 10 days.',
  });
  vi.stubEnv('DATABASE_URL', 'postgresql://test-only.invalid');
  vi.stubEnv('APP_URL', origin);
  vi.stubEnv('RATE_LIMIT_SECRET', 'test-only-route-secret-with-more-than-32-characters');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-20T01:00:00Z'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe('public HTTP boundaries without live database access', () => {
  it('rejects cross-origin submissions and reports before any persistence access', async () => {
    for (const handler of [groupPost, reportPost])
      expect(
        (await handler(request('/api/groups', {}, { origin: 'https://untrusted.invalid' }))).status,
      ).toBe(400);
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });
  it('returns unavailable for writes and challenges when the database is unconfigured', async () => {
    vi.stubEnv('DATABASE_URL', '');
    expect((await groupPost(request('/api/groups', {}))).status).toBe(503);
    expect((await reportPost(request('/api/reports', {}))).status).toBe(503);
    expect((await challengeGet()).status).toBe(503);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('rejects missing, tampered, too-fast, and expired challenges without incrementing rate buckets', async () => {
    const input = validGroup();
    for (const token of ['', input.token + 'z', issueToken()])
      expect((await groupPost(request('/api/groups', { ...input, token }))).status).toBe(400);
    vi.advanceTimersByTime(3600001);
    expect((await groupPost(request('/api/groups', input))).status).toBe(400);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('rejects the honeypot, unsafe URLs, and unsupported report reasons before persistence', async () => {
    const input = validGroup();
    expect((await groupPost(request('/api/groups', { ...input, website: 'spam' }))).status).toBe(
      400,
    );
    expect(
      (await groupPost(request('/api/groups', { ...input, url: 'javascript:alert(1)' }))).status,
    ).toBe(400);
    expect(
      (
        await reportPost(
          request('/api/reports', { groupId: 'group', reason: 'unsupported', token: input.token }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('rejects oversized and non-JSON requests without database access', async () => {
    expect(
      (
        await groupPost(
          request('/api/groups', { text: 'x'.repeat(6000) }, { 'content-length': '6001' }),
        )
      ).status,
    ).toBe(413);
    expect((await groupPost(request('/api/groups', { text: 'x'.repeat(6000) }))).status).toBe(400);
    expect(
      (await groupPost(request('/api/groups', {}, { 'content-type': 'text/plain' }))).status,
    ).toBe(400);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('returns 429 without inserting a group when the persistent limiter denies the request', async () => {
    mocks.rateLimit.mockRejectedValue(
      new Error('Too many attempts. Please try again in 15 minutes.'),
    );
    expect((await groupPost(request('/api/groups', validGroup()))).status).toBe(429);
    expect(mocks.saveGroup).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('rejects a ten-day ban before ordinary rate limits, URL expansion, or group database access', async () => {
    const until = Date.now() + 10 * 24 * 60 * 60 * 1000;
    mocks.abuseCheck.mockRejectedValue(new GroupSubmissionBlockedError(until));
    const response = await groupPost(request('/api/groups', validGroup()));
    expect(response.status).toBe(429);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(863990);
    expect(await response.json()).toMatchObject({
      code: 'GROUP_SUBMISSIONS_BLOCKED',
      blockedUntil: new Date(until).toISOString(),
      error: expect.stringContaining('Bangladesh time'),
    });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.inviteAttempt).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.saveGroup).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });
  it('blocks the third equivalent attempt before attempting another group transaction', async () => {
    mocks.resolve.mockResolvedValue('https://m.me/j/RouteTestInvite');
    mocks.inviteAttempt.mockRejectedValue(new GroupSubmissionBlockedError(Date.now() + 864000000));
    const response = await groupPost(
      request('/api/groups', { ...validGroup(), submitAnyway: true }),
    );
    expect(response.status).toBe(429);
    expect(mocks.inviteAttempt).toHaveBeenCalledWith(
      expect.any(Headers),
      'https://m.me/j/RouteTestInvite',
    );
    expect(mocks.saveGroup).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });
  it('fails closed when configured abuse storage is unavailable', async () => {
    mocks.abuseCheck.mockRejectedValue(new GroupAbuseUnavailableError());
    const response = await groupPost(request('/api/groups', validGroup()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Group submissions are temporarily unavailable. Please try again shortly.',
    });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('resolves shortened invites only after abuse checks and returns the canonical URL for confirmation', async () => {
    mocks.resolve.mockResolvedValue('https://m.me/j/ExpandedInvite');
    mocks.saveGroup.mockResolvedValue({
      status: 'warning',
      groups: [{ id: 'existing', url: 'https://m.me/j/OtherInvite' }],
    });
    const input = { ...validGroup(), url: 'https://short.example/invite' };
    const response = await groupPost(request('/api/groups', input));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'warning',
      resolvedUrl: 'https://m.me/j/ExpandedInvite',
    });
    expect(mocks.rateLimit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.resolve.mock.invocationCallOrder[0],
    );
    expect(mocks.saveGroup).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ url: 'https://m.me/j/ExpandedInvite' }),
    );
    expect(revalidateTag).not.toHaveBeenCalled();
  });
  it('expires all public views immediately after a successful group insertion', async () => {
    mocks.resolve.mockResolvedValue('https://m.me/j/RouteTestInvite');
    mocks.saveGroup.mockImplementation(async () => {
      expect(revalidateTag).not.toHaveBeenCalled();
      return { status: 'created', group: { id: 'new' } };
    });
    expect((await groupPost(request('/api/groups', validGroup()))).status).toBe(201);
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith(CATALOG_CACHE_TAG, { expire: 0 });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });
  it('does not flush public caches for a duplicate or failed transaction', async () => {
    mocks.resolve.mockResolvedValue('https://m.me/j/RouteTestInvite');
    mocks.saveGroup.mockResolvedValue({ status: 'duplicate' });
    expect((await groupPost(request('/api/groups', validGroup()))).status).toBe(200);
    mocks.saveGroup.mockRejectedValue(new Error('Synthetic rollback'));
    expect((await groupPost(request('/api/groups', validGroup()))).status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it('returns an actionable conflict warning without invalidating caches for cross-section reuse', async () => {
    mocks.resolve.mockResolvedValue('https://m.me/j/RouteTestInvite');
    mocks.saveGroup.mockRejectedValue(
      new GroupLinkConflictError({
        number: '9',
        course: { code: 'CSE361' },
        semester: { name: 'Fall - 2026' },
      }),
    );
    const response = await groupPost(
      request('/api/groups', { ...validGroup(), submitAnyway: true }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'INVITE_USED_IN_ANOTHER_SECTION',
      error: expect.stringContaining('CSE361.9 (Fall - 2026)'),
      attemptsRemaining: 2,
      warning: expect.stringContaining('10 days'),
    });
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it('returns a safe expansion error without attempting persistence', async () => {
    mocks.resolve.mockRejectedValue(
      new InviteResolutionError('Short links must point to a public website.'),
    );
    const response = await groupPost(
      request('/api/groups', { ...validGroup(), url: 'https://short.example/invite' }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Short links must point to a public website.' });
    expect(mocks.saveGroup).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('never exposes an internal error or connection string in a public response', async () => {
    mocks.rateLimit.mockRejectedValue(
      new Error('postgresql://synthetic-user:synthetic-password@private.invalid/db'),
    );
    const response = await groupPost(request('/api/groups', validGroup()));
    const body = await response.text();
    expect(body).not.toMatch(/synthetic-password|private\.invalid|postgresql:/);
    expect(body).toContain('Unable to complete');
  });
  it('serves signed form challenges with no-store caching', async () => {
    const response = await challengeGet();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).token).toMatch(/^\d+\.[a-f0-9]+\.[a-f0-9]{64}$/);
    expect(mocks.db).not.toHaveBeenCalled();
  });
});
