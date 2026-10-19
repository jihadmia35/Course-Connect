import { NextResponse } from 'next/server';
import { issueToken } from '@/lib/security';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!process.env.DATABASE_URL)
    return NextResponse.json({ error: 'Submissions need a configured database.' }, { status: 503 });
  return NextResponse.json({ token: issueToken() }, { headers: { 'Cache-Control': 'no-store' } });
}
