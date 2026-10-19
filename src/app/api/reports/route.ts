import { NextResponse } from 'next/server';
import { reportInput } from '@/lib/validation';
import { assertOrigin, rateLimit, verifyToken, publicError, readJsonBody } from '@/lib/security';
import { db } from '@/lib/db';
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (!process.env.DATABASE_URL)
      return NextResponse.json({ error: 'Connect Supabase to enable reports.' }, { status: 503 });
    if (Number(request.headers.get('content-length')) > 5000) throw new Error('Request too large');
    const result = reportInput.safeParse(await readJsonBody(request));
    if (!result.success)
      return NextResponse.json({ error: 'Please check the report fields.' }, { status: 400 });
    verifyToken(result.data.token);
    await rateLimit(request.headers, 'reports', 5);
    const { groupId, reason, details } = result.data;
    await db().messengerGroupLink.findUniqueOrThrow({ where: { id: groupId } });
    await db().groupReport.create({ data: { groupId, reason, details } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return NextResponse.json(
      {
        error:
          message.startsWith('Too many') ||
          message.startsWith('Please wait') ||
          message.startsWith('Refresh the form')
            ? message
            : publicError(error),
      },
      { status: message.startsWith('Too many') ? 429 : 400 },
    );
  }
}
