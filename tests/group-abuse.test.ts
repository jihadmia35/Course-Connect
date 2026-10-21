import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  query: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: () => ({ rateLimitBucket: { findUnique: mocks.findUnique }, $queryRaw: mocks.query }),
}));
import {
  assertGroupSubmissionAllowed,
  recordInviteAttempt,
  GroupSubmissionBlockedError,
} from '@/lib/group-abuse';
import { rateLimitKey } from '@/lib/security';

let serial = 0;
let headers: Headers;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('RATE_LIMIT_SECRET', `disposable-test-only-group-abuse-${serial++}`);
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  vi.stubGlobal('fetch', mocks.fetch);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T10:00:00Z'));
  headers = new Headers({ 'x-forwarded-for': '203.0.113.12', 'x-real-ip': 'spoofed' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function redis() {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis-test-only.upstash.io');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-only-never-use-in-production');
}
function result(value: unknown) {
  return new Response(JSON.stringify({ result: value }), { status: 200 });
}
describe('persistent group submission protection', () => {
  it('caches only active bans and skips all backing-store work until the fixed expiry', async () => {
    const expires = Date.now() + 864000000;
    mocks.findUnique.mockResolvedValue({ expiresAt: new Date(expires) });
    for (let i = 0; i < 4; i++)
      await expect(assertGroupSubmissionAllowed(headers)).rejects.toMatchObject({
        code: 'GROUP_SUBMISSIONS_BLOCKED',
      });
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    vi.setSystemTime(expires);
    await expect(assertGroupSubmissionAllowed(headers)).resolves.toBeUndefined();
    expect(mocks.findUnique).toHaveBeenCalledTimes(2);
  });
  it('does not cache allowed actors, so another instance can block them immediately', async () => {
    mocks.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ expiresAt: new Date(Date.now() + 864000000) });
    await assertGroupSubmissionAllowed(headers);
    await expect(assertGroupSubmissionAllowed(headers)).rejects.toBeInstanceOf(
      GroupSubmissionBlockedError,
    );
    expect(mocks.findUnique).toHaveBeenCalledTimes(2);
  });
  it('uses trusted deployment IPs, ignores client spoofing off Vercel, and never stores a raw IP', () => {
    const key = rateLimitKey(headers, 'scope');
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(rateLimitKey(new Headers({ 'x-forwarded-for': '203.0.113.13' }), 'scope')).not.toBe(key);
    expect(
      rateLimitKey(new Headers({ 'x-forwarded-for': '203.0.113.12, 198.51.100.4' }), 'scope'),
    ).toBe(key);
    vi.stubEnv('VERCEL', '');
    expect(rateLimitKey(headers, 'scope')).toBe(
      rateLimitKey(new Headers({ 'x-forwarded-for': 'spoofed' }), 'scope'),
    );
  });
  it('checks a shared Redis ban without PostgreSQL and caches its positive denial', async () => {
    redis();
    mocks.fetch.mockResolvedValue(result(String(Date.now() + 864000000)));
    await expect(assertGroupSubmissionAllowed(headers)).rejects.toMatchObject({
      retryAfterSeconds: 864000,
    });
    await expect(assertGroupSubmissionAllowed(headers)).rejects.toBeInstanceOf(
      GroupSubmissionBlockedError,
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('https://redis-test-only.upstash.io/');
    expect(options).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error' });
    expect(JSON.parse(options.body)).toEqual([
      'GET',
      expect.stringMatching(/^seu:abuse:[a-f0-9]{64}$/),
    ]);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('normalizes equivalent invites into the same atomic Redis counter and isolates different invites', async () => {
    redis();
    mocks.fetch.mockImplementation(async () => result([1, 0]));
    for (const url of [
      'https://m.me/j/OneInvite',
      'https://www.messenger.com/j/OneInvite/?send_source=gc%3Acopy_invite',
      'https://messenger.com/join/OneInvite',
      'https://m.me/j/AnotherInvite',
    ])
      await recordInviteAttempt(headers, url);
    const commands = mocks.fetch.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(commands[0].slice(0, 3)).toEqual([
      'EVAL',
      expect.stringContaining("redis.call('INCR'"),
      2,
    ]);
    expect(commands[0][4]).toBe(commands[1][4]);
    expect(commands[0][4]).toBe(commands[2][4]);
    expect(commands[0][4]).not.toBe(commands[3][4]);
    expect(JSON.stringify(commands)).not.toContain('203.0.113.12');
    expect(JSON.stringify(commands)).not.toContain('OneInvite');
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('turns the third Redis attempt into a ten-day denial with the original expiry', async () => {
    redis();
    const until = Date.now() + 864000000;
    mocks.fetch.mockResolvedValue(result([3, until]));
    await expect(recordInviteAttempt(headers, 'https://m.me/j/ThirdInvite')).rejects.toMatchObject({
      blockedUntil: new Date(until).toISOString(),
      retryAfterSeconds: 864000,
    });
    vi.advanceTimersByTime(60000);
    await expect(assertGroupSubmissionAllowed(headers)).rejects.toMatchObject({
      retryAfterSeconds: 863940,
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it.each(['partial', 'http', 'error', 'invalid', 'network'])(
    'fails closed for %s Redis configuration/responses without PostgreSQL fallback',
    async (kind) => {
      redis();
      if (kind === 'partial') vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
      if (kind === 'http') vi.stubEnv('UPSTASH_REDIS_REST_URL', 'http://redis-test-only.invalid');
      if (kind === 'error')
        mocks.fetch.mockResolvedValue(
          new Response(JSON.stringify({ error: 'secret-internal-error' })),
        );
      if (kind === 'invalid') mocks.fetch.mockResolvedValue(result('not-a-timestamp'));
      if (kind === 'network') mocks.fetch.mockRejectedValue(new Error('secret-network-error'));
      await expect(assertGroupSubmissionAllowed(headers)).rejects.toThrow(
        'temporarily unavailable',
      );
      expect(mocks.findUnique).not.toHaveBeenCalled();
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );
});
