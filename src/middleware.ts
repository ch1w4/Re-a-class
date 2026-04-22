// ──────────────────────────────────────────────
// Next.js ミドルウェア — 全リクエストにセッション認証を適用する
// ──────────────────────────────────────────────
// 処理フロー:
//   1. _next/* や favicon などの静的アセットは matcher で除外済み（このファイルに届かない）
//   2. PUBLIC リストに含まれるパス（/login, /api/auth/*）は認証不要でそのまま通す
//   3. それ以外のパスで session_id Cookie がなければ:
//      - API パス  → 401 JSON を返す
//      - ページ    → /login?redirect=元のパス にリダイレクト
//   4. Cookie がある場合は Next.js にそのまま処理を委ねる
//      （Cookie の有効性は各 API ルートの requireAuth / getSessionUser で再確認する）
//
// ※ ミドルウェアではセッションの有効性（期限切れかどうか）まで検証しない。
//    DB アクセスをミドルウェアで毎リクエスト行うとパフォーマンスに影響するため。
import { NextRequest, NextResponse } from 'next/server';

// ログインなしでアクセスできるパス（完全一致 or 前方一致で判定）
const PUBLIC = ['/login', '/api/auth/login', '/api/auth/logout'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 静的ファイルや公開パスは認証をスキップ
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))
  ) {
    return NextResponse.next();
  }

  // session_id Cookie の存在チェック（値の有効性は各 API ルートで確認）
  const sessionId = request.cookies.get('session_id')?.value;
  if (!sessionId) {
    if (pathname.startsWith('/api/')) {
      // API リクエストには JSON で 401 を返す
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ページリクエストはログイン画面にリダイレクト（redirect パラメータでログイン後に元のページへ戻れる）
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Cookie あり → そのまま通す
  return NextResponse.next();
}

// matcher: 静的アセット（_next/static, _next/image, favicon.ico）はミドルウェアをバイパスする
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
