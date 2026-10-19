import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from './db';
const devSecret = randomBytes(32).toString('hex');
function secret() {
  if (process.env.NODE_ENV === 'production' && !process.env.RATE_LIMIT_SECRET)
    throw new Error('RATE_LIMIT_SECRET must be configured.');
  return process.env.RATE_LIMIT_SECRET || devSecret;
}
export function issueToken() {
  const body = `${Date.now()}.${randomBytes(12).toString('hex')}`;
  return `${body}.${createHmac('sha256', secret()).update(body).digest('hex')}`;
}
export function verifyToken(token: string) {
  const [timestamp, nonce, signature] = token.split('.');
  if (!timestamp || !nonce || !signature || !/^[a-f0-9]{64}$/.test(signature))
    throw new Error('Refresh the form and try again.');
  const body = `${timestamp}.${nonce}`,
    expected = createHmac('sha256', secret()).update(body).digest('hex');
  if (
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ||
    Date.now() - Number(timestamp) < 2000 ||
    Date.now() - Number(timestamp) > 3600000
  )
    throw new Error('Please wait a moment, or refresh an expired form.');
}
export function assertOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  let expected = process.env.APP_URL?.trim();
  if (!expected) {
    expected = url.origin;
    // next start may construct request.url with its internal bind address. In that
    // case use the actual HTTP Host, never arbitrary forwarded-host/proto headers.
    const host = request.headers.get('host');
    if (host && ['0.0.0.0', '127.0.0.1', 'localhost', '[::]', '[::1]'].includes(url.hostname)) {
      const protocol = process.env.VERCEL === '1' ? 'https:' : url.protocol;
      try {
        if (!/^(?:[a-z\d.-]+|\[[\da-f:]+\])(?::\d{1,5})?$/i.test(host))
          throw new Error('Invalid host');
        const servingUrl = new URL(`${protocol}//${host}`);
        const authority = host.toLowerCase();
        const defaultAuthority = `${servingUrl.hostname}:${protocol === 'https:' ? '443' : '80'}`;
        if (servingUrl.host !== authority && defaultAuthority !== authority)
          throw new Error('Invalid host');
        expected = servingUrl.origin;
      } catch {
        throw new Error('Request origin is not allowed.');
      }
    }
  }
  if (!origin || origin !== expected) throw new Error('Request origin is not allowed.');
}
export async function rateLimit(headers: Headers, scope: string, limit = 8) {
  // Vercel overwrites x-forwarded-for; elsewhere configure a trusted reverse proxy or use the shared bucket.
  const ip = process.env.VERCEL
    ? headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    : 'shared-local';
  const key = createHmac('sha256', secret()).update(`${scope}:${ip}`).digest('hex');
  const now = new Date(),
    expires = new Date(Date.now() + 15 * 60000);
  const rows = await db().$queryRaw<
    { count: number }[]
  >`INSERT INTO "RateLimitBucket" (key,count,"expiresAt") VALUES (${key},1,${expires}) ON CONFLICT (key) DO UPDATE SET count=CASE WHEN "RateLimitBucket"."expiresAt" < ${now} THEN 1 ELSE "RateLimitBucket".count + 1 END,"expiresAt"=CASE WHEN "RateLimitBucket"."expiresAt" < ${now} THEN ${expires} ELSE "RateLimitBucket"."expiresAt" END RETURNING count`;
  if ((rows[0]?.count ?? limit + 1) > limit)
    throw new Error('Too many attempts. Please try again in 15 minutes.');
}
export function publicError(error: unknown) {
  console.error('Request failed', { kind: error instanceof Error ? error.name : 'Unknown' });
  return 'Unable to complete the request. Please try again.';
}
export async function readJsonBody(request: Request, maxBytes = 5000): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new Error('Use a JSON request.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Empty request.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('Request too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
