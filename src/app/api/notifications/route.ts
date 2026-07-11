// 通知一覧取得 API
// GET /api/notifications
// ログイン中のユーザー宛の通知を最新 50 件返す。
// 通知タイプ: UNDERSTANDING_CHECK（理解度チェックのお知らせ）
//             UNDERSTANDING_RESULT（教師向け理解度集計結果）
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error, user } = await requireAuth(request, ['TEACHER', 'STUDENT']);
  if (error) return error;

  const allowedType = user!.role === 'TEACHER' ? 'UNDERSTANDING_RESULT' : 'UNDERSTANDING_CHECK';

  const rows = await prisma.notification.findMany({
    where: { userId: user!.id, type: allowedType },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 100,
    select: { id: true, type: true, title: true, body: true, link: true, isRead: true, createdAt: true },
  });

  // 同じ授業・種別の通知が過去の競合で複数作られていても、最新の1件だけ返す。
  const seen = new Set<string>();
  const notifications = rows.filter((notification) => {
    const key = notification.link ? `${notification.type}:${notification.link}` : notification.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 50);

  return NextResponse.json(notifications, { headers: { 'Cache-Control': 'no-store' } });
}
