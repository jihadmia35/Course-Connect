import { NextResponse } from 'next/server';
import { groupInput } from '@/lib/validation';
import { assertOrigin, rateLimit, verifyToken, publicError, readJsonBody } from '@/lib/security';
import { saveGroup } from '@/lib/groups';
import { db } from '@/lib/db';
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
    await rateLimit(request.headers, 'groups');
    const result = await saveGroup(db(), input.data);
    return NextResponse.json(result, { status: result.status === 'created' ? 201 : 200 });
  } catch (error) {
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
      { error: safe.includes(message) ? message : publicError(error) },
      { status: message.startsWith('Too many') ? 429 : 400 },
    );
  }
}
