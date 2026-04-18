import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

const includeAll = {
  messages: { orderBy: { timestamp: 'asc' as const }, include: { user: { select: { displayName: true } } } },
  reactions: { orderBy: { timestamp: 'asc' as const } },
  surveys: { include: { options: true }, orderBy: { createdAt: 'asc' as const } },
  teacher: { select: { displayName: true } },
  enrollments: { select: { userId: true } },
};

export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error } = await requireAuth(request);
  if (error) return error;

  const room = await prisma.room.findUnique({ where: { id: params.roomId }, include: includeAll });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  return NextResponse.json(room);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['TEACHER', 'SCHOOL_ADMIN', 'SERVER_ADMIN']);
  if (error) return error;

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (user!.role === 'TEACHER' && room.teacherId !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (room.endedAt) return NextResponse.json({ error: 'Already ended' }, { status: 400 });

  const endedAt = new Date();
  const updated = await prisma.room.update({
    where: { id: params.roomId },
    data: { endedAt },
    include: includeAll,
  });

  // 理解度チェックをスケジュール（4日後）
  await prisma.understandingCheck.upsert({
    where: { roomId: params.roomId },
    update: {},
    create: {
      roomId: params.roomId,
      scheduledAt: new Date(endedAt.getTime() + 4 * 24 * 60 * 60 * 1000),
    },
  });

  return NextResponse.json(updated);
}
