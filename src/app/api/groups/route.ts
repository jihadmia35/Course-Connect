import { NextResponse } from 'next/server';
import { groupInput } from '@/lib/validation';
import { assertOrigin, rateLimit, verifyToken, publicError, readJsonBody } from '@/lib/security';
import { saveGroup } from '@/lib/groups';
import { db } from '@/lib/db';
import { InviteResolutionError, resolveMessengerInvite } from '@/lib/resolve-invite';
import { invalidateCatalogRoute } from '@/lib/catalog-cache';
import { GroupLinkConflictError } from '@/lib/group-link-policy';
import {
  assertGroupSubmissionAllowed,
  recordInviteAttempt,
  GroupSubmissionBlockedError,
  GroupAbuseUnavailableError,
} from '@/lib/group-abuse';
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (!process.env.DATABASE_URL)
      return NextResponse.json(
        { error: 'Connect Supabase to enable submissions.' },
        { status: 503 },
      );
    if (Number(request.headers.get('content-length')) > 5000)
      return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    const input = groupInput.safeParse(await readJsonBody(request));
    if (!input.success)
      return NextResponse.json(
        { error: input.error.issues[0]?.message ?? 'Invalid input.' },
        { status: 400 },
      );
    verifyToken(input.data.token);
    await assertGroupSubmissionAllowed(request.headers);
    await rateLimit(request.headers, 'groups');
    const resolvedUrl = await resolveMessengerInvite(input.data.url);
    const attempt = await recordInviteAttempt(request.headers, resolvedUrl);
    let result;
    try {
      result = await saveGroup(db(), { ...input.data, url: resolvedUrl });
    } catch (error) {
      if (error instanceof GroupLinkConflictError)
        return NextResponse.json(
          { error: `${error.message} ${attempt.warning}`, code: error.code, ...attempt },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        );
      throw error;
    }
    if (result.status === 'created') invalidateCatalogRoute();
    return NextResponse.json(
      { ...result, resolvedUrl, ...(result.status === 'duplicate' ? attempt : {}) },
      { status: result.status === 'created' ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof GroupSubmissionBlockedError)
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          blockedUntil: error.blockedUntil,
          retryAfterSeconds: error.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Cache-Control': 'no-store', 'Retry-After': String(error.retryAfterSeconds) },
        },
      );
    if (error instanceof GroupAbuseUnavailableError)
      return NextResponse.json(
        { error: error.message },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    const message = error instanceof Error ? error.message : '';
    const safe = [
      'Too many attempts. Please try again in 15 minutes.',
      'Please wait a moment, or refresh an expired form.',
      'Refresh the form and try again.',
      'Request origin is not allowed.',
      'Section does not belong to the selected course and semester.',
      'Submissions are currently paused.',
    ];
    return NextResponse.json(
      {
        error:
          error instanceof InviteResolutionError || safe.includes(message)
            ? message
            : publicError(error),
      },
      { status: message.startsWith('Too many') ? 429 : 400 },
    );
  }
}
