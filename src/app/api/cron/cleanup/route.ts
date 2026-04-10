import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);

  const result = await prisma.room.updateMany({
    where: {
      endedAt: null,
      createdAt: { lt: fiveHoursAgo },
    },
    data: { endedAt: new Date() },
  });

  return NextResponse.json({ closed: result.count });
}
