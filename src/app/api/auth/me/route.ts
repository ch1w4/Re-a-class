// ログイン中ユーザー情報取得 API
// GET /api/auth/me
// Cookie のセッションから現在のユーザー情報（ID・名前・ロール・学校）を返す。
// フロントエンドが初回レンダリング時に呼び出してロールに応じた画面遷移を行う。
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const sessionId = request.cookies.get('session_id')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getSessionUser(sessionId);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    id: user.id,
    displayName: user.displayName,
    role: user.role,
    schoolId: user.schoolId,
    schoolName: user.school.name,
  });
}
