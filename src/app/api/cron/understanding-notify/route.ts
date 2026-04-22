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
    // 参加者がいない授業はスキップ（理解度チェックを送る相手がいない）
    if (studentIds.length === 0) continue;

    // 全対象生徒へ一括で通知を作成する（createMany で N+1 を回避）
    await prisma.notification.createMany({
      data: studentIds.map((userId) => ({
        userId,
        type: 'UNDERSTANDING_CHECK' as const,
        title: '理解度チェック',
        body: `「${check.room.name}」の理解度チェックに回答してください`,
        // 通知リンクをクリックすると生徒の授業画面の理解度タブへ遷移する
        link: `/student/${check.room.id}?tab=understanding`,
      })),
    });

    // 集計 (tally) を当日深夜（UTC 翌0時）にスケジュールする。
    // setUTCHours(24,...) は自動的に翌日0時に繰り上がる。
    const tallyAt = new Date(now);
    tallyAt.setUTCHours(24, 0, 0, 0);
    await prisma.understandingCheck.update({
      where: { id: check.id },
      data: { notifiedAt: now, tallyAt },
    });
    notified++;
  }

  return NextResponse.json({ notified });
}
