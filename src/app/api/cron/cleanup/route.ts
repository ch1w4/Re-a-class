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

  // 2時間以上経過したアクティブなルームを自動終了
  const closed = await prisma.room.updateMany({
    where: {
      endedAt: null,
      createdAt: { lt: twoHoursAgo },
    },
    data: { endedAt: new Date() },
  });

  // 終了から1週間以上経過したルームを削除
  const deleted = await prisma.room.deleteMany({
    where: {
      endedAt: { lt: oneWeekAgo },
    },
  });

  return NextResponse.json({ closed: closed.count, deleted: deleted.count });
}
