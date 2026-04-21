// 自動クリーンアップ cron エンドポイント
// POST /api/cron/cleanup — x-cron-secret ヘッダーで認証（CRON_SECRET 環境変数と照合）
// 実行内容:
//   1. 作成から 2 時間以上経過したアクティブなルームを自動終了（endedAt をセット）
//      → 同時に理解度チェックを終了 4 日後にスケジュール（upsert で重複防止）
//   2. 終了から 1 週間以上経過したルームと全関連データを削除
// サーバー側の crontab 等で 1 時間ごとに呼び出す想定。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // 作成から 2 時間経過したアクティブなルームを取得（教師が終了し忘れた場合の自動終了）
  const roomsToClose = await prisma.room.findMany({
    where: { endedAt: null, createdAt: { lt: twoHoursAgo } },
    select: { id: true },
  });

  const endedAt = new Date();
  for (const room of roomsToClose) {
    await prisma.room.update({ where: { id: room.id }, data: { endedAt } });
    // 終了と同時に理解度チェックを 4 日後にスケジュール
    // upsert で既存の UnderstandingCheck があっても二重作成しない
    await prisma.understandingCheck.upsert({
      where: { roomId: room.id },
      update: {},
      create: {
        roomId: room.id,
        scheduledAt: new Date(endedAt.getTime() + 4 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // 終了から 1 週間経過したルームを削除する。
  // Prisma スキーマの onDelete: Cascade により関連する全データ
  // （ChatMessage / Reaction / Survey / Enrollment / BoardPost / UnderstandingCheck / Notification）も連鎖削除される。
  const deleted = await prisma.room.deleteMany({
    where: { endedAt: { lt: oneWeekAgo } },
  });

  return NextResponse.json({ closed: roomsToClose.length, deleted: deleted.count });
}
