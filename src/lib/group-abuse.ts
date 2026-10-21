import 'server-only';
import { db } from './db';
import { rateLimitKey } from './security';
import { normalizeMessengerUrl } from './validation';

const BLOCK_MS = 10 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const MAX_CACHED_BLOCKS = 2000;
// Only positive denials are cached. Never cache an allowed result: another
// Vercel instance may have just recorded the third duplicate attempt.
const blocked = new Map<string, number>();

export class GroupSubmissionBlockedError extends Error {
  readonly code = 'GROUP_SUBMISSIONS_BLOCKED';
  readonly blockedUntil: string;
  readonly retryAfterSeconds: number;

  constructor(until: number) {
    const date = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dhaka',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(until);
    super(
      'Group submissions from your network are blocked for 10 days because the same invite was submitted 3 times. ' +
        `You can submit again after ${date} (Bangladesh time). You can still browse and join groups.`,
    );
    this.name = 'GroupSubmissionBlockedError';
    this.blockedUntil = new Date(until).toISOString();
    this.retryAfterSeconds = Math.max(1, Math.ceil((until - Date.now()) / 1000));
  }
}

export class GroupAbuseUnavailableError extends Error {
  constructor() {
    super('Group submissions are temporarily unavailable. Please try again shortly.');
    this.name = 'GroupAbuseUnavailableError';
  }
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url && !token) return null;
  // A partial/broken configuration must not silently switch stores and reset bans.
  if (!url || !token) throw new GroupAbuseUnavailableError();
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      throw new Error('Invalid Redis endpoint');
    return { url: parsed.href, token };
  } catch {
    throw new GroupAbuseUnavailableError();
  }
}

async function redisCommand(
  config: NonNullable<ReturnType<typeof redisConfig>>,
  command: (string | number)[],
) {
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error('Redis unavailable');
    const data = (await response.json()) as { result?: unknown; error?: unknown };
    if (data.error || !Object.hasOwn(data, 'result')) throw new Error('Invalid Redis response');
    return data.result;
  } catch {
    // Do not expose service errors, URLs, or credentials to the client/logs.
    throw new GroupAbuseUnavailableError();
  }
}

function rememberBlock(key: string, until: number) {
  if (blocked.size >= MAX_CACHED_BLOCKS) {
    for (const [oldKey, expires] of blocked) if (expires <= Date.now()) blocked.delete(oldKey);
    if (blocked.size >= MAX_CACHED_BLOCKS) blocked.delete(blocked.keys().next().value!);
  }
  blocked.set(key, until);
}

function actorKeys(headers: Headers) {
  const key = rateLimitKey(headers, 'group-submission-block:v1');
  const redis = redisConfig();
  return { key, redis, cacheKey: `${redis?.url ?? 'postgres'}:${key}` };
}

/** Run before the ordinary limiter, URL expansion, and group database queries. */
export async function assertGroupSubmissionAllowed(headers: Headers) {
  const { key, redis, cacheKey } = actorKeys(headers);
  const cached = blocked.get(cacheKey);
  if (cached && cached > Date.now()) throw new GroupSubmissionBlockedError(cached);
  blocked.delete(cacheKey);
  let until: number;
  if (redis) {
    const value = await redisCommand(redis, ['GET', `seu:abuse:${key}`]);
    if (value === null) return;
    until = Number(value);
    if (!Number.isSafeInteger(until) || until <= 0) throw new GroupAbuseUnavailableError();
  } else {
    const record = await db().rateLimitBucket.findUnique({
      where: { key },
      select: { expiresAt: true },
    });
    if (!record) return;
    until = record.expiresAt.getTime();
  }
  if (until > Date.now()) {
    rememberBlock(cacheKey, until);
    throw new GroupSubmissionBlockedError(until);
  }
}

// One atomic script, not a GET/INCR/SET sequence: concurrent requests cannot
// lose strikes, extend an existing ban, or leave a counter without its TTL.
const STRIKE_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing and tonumber(existing) > tonumber(ARGV[1]) then
  return {3, tonumber(existing)}
end
local count = redis.call('INCR', KEYS[2])
if count == 1 then redis.call('PEXPIRE', KEYS[2], ARGV[2]) end
if count >= 3 then
  local untilAt = tonumber(ARGV[1]) + tonumber(ARGV[2])
  redis.call('SET', KEYS[1], tostring(untilAt), 'PX', ARGV[2])
  return {count, untilAt}
end
return {count, 0}
`;

/** Equivalent URLs share one counter, including the initial submission. */
export async function recordInviteAttempt(headers: Headers, url: string) {
  const { key, redis, cacheKey } = actorKeys(headers);
  const strikeKey = rateLimitKey(headers, `group-duplicate:v1:${normalizeMessengerUrl(url)}`);
  const now = Date.now();
  let count: number;
  let until: number;
  if (redis) {
    const result = await redisCommand(redis, [
      'EVAL',
      STRIKE_SCRIPT,
      2,
      `seu:abuse:${key}`,
      `seu:abuse:${strikeKey}`,
      now,
      BLOCK_MS,
    ]);
    if (
      !Array.isArray(result) ||
      result.length !== 2 ||
      !result.every((value) => typeof value === 'number' && Number.isSafeInteger(value))
    )
      throw new GroupAbuseUnavailableError();
    [count, until] = result as [number, number];
    if (count < 1 || (count >= MAX_ATTEMPTS && until <= now))
      throw new GroupAbuseUnavailableError();
  } else {
    const timestamp = new Date(now);
    const expires = new Date(now + BLOCK_MS);
    const rows = await db().$queryRaw<{ count: number; blockedUntil: Date | null }[]>`
      WITH strike AS (
        INSERT INTO "RateLimitBucket" (key, count, "expiresAt")
        VALUES (${strikeKey}, 1, ${expires})
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN "RateLimitBucket"."expiresAt" <= ${timestamp}
            THEN 1 ELSE "RateLimitBucket".count + 1 END,
          "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" <= ${timestamp}
            THEN ${expires} ELSE "RateLimitBucket"."expiresAt" END
        RETURNING count
      ), ban AS (
        INSERT INTO "RateLimitBucket" (key, count, "expiresAt")
        SELECT ${key}, 0, ${expires} FROM strike WHERE count >= ${MAX_ATTEMPTS}
        ON CONFLICT (key) DO UPDATE SET "expiresAt" =
          CASE WHEN "RateLimitBucket"."expiresAt" > ${timestamp}
            THEN "RateLimitBucket"."expiresAt" ELSE EXCLUDED."expiresAt" END
        RETURNING "expiresAt"
      )
      SELECT strike.count, ban."expiresAt" AS "blockedUntil"
      FROM strike LEFT JOIN ban ON true
    `;
    const row = rows[0];
    if (!row) throw new GroupAbuseUnavailableError();
    count = row.count;
    until = row.blockedUntil?.getTime() ?? 0;
  }
  if (until > now) {
    rememberBlock(cacheKey, until);
    throw new GroupSubmissionBlockedError(until);
  }
  const remaining = MAX_ATTEMPTS - count;
  return {
    inviteAttempts: count,
    attemptsRemaining: remaining,
    warning: `This invite has been submitted ${count} of 3 times. Repeating it ${remaining} more ${remaining === 1 ? 'time' : 'times'} will block group submissions for 10 days.`,
  };
}
