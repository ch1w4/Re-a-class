import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const includeAll = {
  messages: { orderBy: { timestamp: 'asc' as const } },
  reactions: { orderBy: { timestamp: 'asc' as const } },
  surveys: { include: { options: true }, orderBy: { createdAt: 'asc' as const } },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const room = await prisma.room.findUnique({
    where: { id: params.roomId },
    include: includeAll,
  });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  return NextResponse.json(room);
}

/** 授業終了 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (room.endedAt) return NextResponse.json({ error: 'Already ended' }, { status: 400 });

  const updated = await prisma.room.update({
    where: { id: params.roomId },
    data: { endedAt: new Date() },
    include: includeAll,
  });
  return NextResponse.json(updated);
}
