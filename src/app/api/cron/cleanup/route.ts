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

  const roomsToClose = await prisma.room.findMany({
    where: { endedAt: null, createdAt: { lt: twoHoursAgo } },
    select: { id: true },
  });

  const endedAt = new Date();
  for (const room of roomsToClose) {
    await prisma.room.update({ where: { id: room.id }, data: { endedAt } });
    await prisma.understandingCheck.upsert({
      where: { roomId: room.id },
      update: {},
      create: {
        roomId: room.id,
        scheduledAt: new Date(endedAt.getTime() + 4 * 24 * 60 * 60 * 1000),
      },
    });
  }

  const deleted = await prisma.room.deleteMany({
    where: { endedAt: { lt: oneWeekAgo } },
  });

  return NextResponse.json({ closed: roomsToClose.length, deleted: deleted.count });
}
