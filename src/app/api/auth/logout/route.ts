// ログアウト API
// POST /api/auth/logout
// DB からセッションを削除し、Cookie を空にしてログアウトする。
import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get('session_id')?.value;
  if (sessionId) await deleteSession(sessionId);

  const res = NextResponse.json({ ok: true });
  res.cookies.set('session_id', '', { maxAge: 0, path: '/' });
  return res;
}
