// 理解度チェック通知 cron エンドポイント
// POST /api/cron/understanding-notify — x-cron-secret ヘッダーで認証
// scheduledAt が現在時刻以前で、まだ notifiedAt がない UnderstandingCheck を対象に、
// その授業に参加した生徒全員に「UNDERSTANDING_CHECK」通知を送信する。
// 通知後は notifiedAt を記録し、集計 (tally) を当日深夜にスケジュールする（提出期限は当日のみ）。
// サーバー側の crontab 等で 1 時間ごとに呼び出す想定。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  // scheduledAt <= 現在 かつ まだ未通知（notifiedAt=null）のチェックを取得
  const checks = await prisma.understandingCheck.findMany({
    where: { scheduledAt: { lte: now }, notifiedAt: null },
    include: { room: { include: { enrollments: { select: { userId: true } } } } },
  });

  let notified = 0;
  for (const check of checks) {
    // Enrollment から対象の生徒 ID 一覧を取得（授業に参加した生徒のみが対象）
    const studentIds = check.room.enrollments.map((e) => e.userId);
    // 集計 (tally) を当日深夜（UTC 翌0時）にスケジュールする。
    // setUTCHours(24,...) は自動的に翌日0時に繰り上がる。
    const tallyAt = new Date(now);
    tallyAt.setUTCHours(24, 0, 0, 0);
    const claimed = await prisma.$transaction(async (tx) => {
      const claim = await tx.understandingCheck.updateMany({
        where: { id: check.id, notifiedAt: null },
        data: { notifiedAt: now, tallyAt },
      });
      if (claim.count === 0) return false;

      if (studentIds.length > 0) {
        await tx.notification.createMany({
          data: studentIds.map((userId) => ({
            userId,
            type: 'UNDERSTANDING_CHECK' as const,
            title: '理解度チェック',
            body: `「${check.room.name}」の理解度チェックに回答してください`,
            link: `/student/${check.room.id}?tab=understanding`,
          })),
        });
      }
      return true;
    });
    if (claimed) notified++;
  }

  return NextResponse.json({ notified });
}
