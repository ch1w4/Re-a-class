// ──────────────────────────────────────────────
// API ルート用の認証チェックヘルパー
// ──────────────────────────────────────────────
// Cookie の session_id を検証し、
//   - 未ログインなら 401 Unauthorized
//   - ロール不一致なら 403 Forbidden
//   - OK なら { error: null, user } を返す
//
// 使い方:
//   const { error, user } = await requireAuth(request, ['TEACHER']);
//   if (error) return error;  // ← ここで return しないと user が null のまま続行してしまう
//   // 以降 user は非 null
//
// roles を省略すると「ログイン済みなら全ロール許可」になる（一覧取得系のエンドポイントで使用）
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from './auth';
import type { Role } from '@prisma/client';

export async function requireAuth(request: NextRequest, roles?: Role[]) {
  // Cookie から session_id を取り出す（httpOnly なので JS から直接読めない）
  const sessionId = request.cookies.get('session_id')?.value;
  if (!sessionId) {
    // Cookie がない = ログインしていない
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), user: null };
  }

  // session_id を DB で検証し、対応するユーザーを取得
  const user = await getSessionUser(sessionId);
  if (!user) {
    // セッションが存在しない or 期限切れ
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), user: null };
  }

  // 呼び出し側がロール制限を指定している場合、ユーザーのロールが含まれるか確認
  if (roles && !roles.includes(user.role)) {
    // ログイン済みだが権限が足りない
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), user: null };
  }

  // 認証・認可ともに OK
  return { error: null, user };
}
