// Next.js ミドルウェア — 全リクエストに対してセッション認証を適用する
// 未ログインのアクセスを /login にリダイレクト（API の場合は 401 を返す）。
// PUBLIC リストに含まれるパスはログイン不要で通過させる。
// _next/static 等の静的アセットは matcher で除外済みなので処理しない。
import { NextRequest, NextResponse } from 'next/server';

// ログインなしで閲覧できるパス（完全一致 or 前方一致）
const PUBLIC = ['/login', '/api/auth/login', '/api/auth/logout'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))
  ) {
    return NextResponse.next();
  }

  const sessionId = request.cookies.get('session_id')?.value;
  if (!sessionId) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
