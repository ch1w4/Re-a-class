import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, createSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { userId, password } = await request.json();
  if (!userId || !password) {
    return NextResponse.json({ error: 'IDとパスワードを入力してください' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: 'IDまたはパスワードが正しくありません' }, { status: 401 });
  }

  const sessionId = await createSession(user.id);

  const res = NextResponse.json({ role: user.role, displayName: user.displayName });
  res.cookies.set('session_id', sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}
