// 管理者認証ヘルパー
// 管理者専用 API の認証チェックに使用する。
// リクエストの x-admin-password ヘッダーを検証し、
// 不正なら 401 レスポンスを返す。
// パスワードは環境変数 ADMIN_PASSWORD で設定（デフォルト: pass）。
import { NextRequest, NextResponse } from 'next/server';

export function validateAdminPassword(request: NextRequest): NextResponse | null {
  const password = request.headers.get('x-admin-password');
  const expected = process.env.ADMIN_PASSWORD ?? 'pass';
  if (!password || password !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
