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
  const { error, user } = await requireAuth(request);
  if (error) return error;

  const notifications = await prisma.notification.findMany({
    where: { userId: user!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json(notifications);
}
