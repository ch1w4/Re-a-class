// API ルート用の認証チェックヘルパー
// Cookie の session_id を検証し、未認証なら 401、ロール不一致なら 403 を返す。
// roles を省略すると「ログイン済みであれば全ロール許可」になる。
// 使い方: const { error, user } = await requireAuth(request, ['TEACHER']);
//         if (error) return error;
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from './auth';
import type { Role } from '@prisma/client';

export async function requireAuth(request: NextRequest, roles?: Role[]) {
  const sessionId = request.cookies.get('session_id')?.value;
  if (!sessionId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), user: null };
  }
  const user = await getSessionUser(sessionId);
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), user: null };
  }
  if (roles && !roles.includes(user.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), user: null };
  }
  return { error: null, user };
}
