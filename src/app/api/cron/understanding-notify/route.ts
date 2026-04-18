import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const checks = await prisma.understandingCheck.findMany({
    where: { scheduledAt: { lte: now }, notifiedAt: null },
    include: { room: { include: { enrollments: { select: { userId: true } } } } },
  });

  let notified = 0;
  for (const check of checks) {
    const studentIds = check.room.enrollments.map((e) => e.userId);
    if (studentIds.length === 0) continue;

    await prisma.notification.createMany({
      data: studentIds.map((userId) => ({
        userId,
        type: 'UNDERSTANDING_CHECK' as const,
        title: '理解度チェック',
        body: `「${check.room.name}」の理解度チェックに回答してください`,
        link: `/student/${check.room.id}?tab=understanding`,
      })),
    });

    const tallyAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    await prisma.understandingCheck.update({
      where: { id: check.id },
      data: { notifiedAt: now, tallyAt },
    });
    notified++;
  }

  return NextResponse.json({ notified });
}
