// 自動クリーンアップ API
// POST /api/cron/cleanup
// 定期実行（cronなど）から呼ばれ、以下の2つの処理を行う:
//   1. 作成から2時間以上経過した未終了ルームを自動終了
//   2. 終了から1週間以上経過したルームとその全データを削除
// x-cron-secret ヘッダーで認証する（環境変数 CRON_SECRET と照合）。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // 不正アクセス防止: cronシークレットを検証
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // 2時間以上経過したアクティブなルームを自動終了
  const closed = await prisma.room.updateMany({
    where: {
      endedAt: null,
      createdAt: { lt: twoHoursAgo },
    },
    data: { endedAt: new Date() },
  });

  // 終了から1週間以上経過したルームを削除（関連データも cascade で削除される）
  const deleted = await prisma.room.deleteMany({
    where: {
      endedAt: { lt: oneWeekAgo },
    },
  });

  return NextResponse.json({ closed: closed.count, deleted: deleted.count });
}
