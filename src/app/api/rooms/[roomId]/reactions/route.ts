import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const VALID_TYPES = ['understood', 'confused', 'question', 'slow', 'fast'];

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (room.endedAt) return NextResponse.json({ error: 'Room has ended' }, { status: 403 });

  const { type } = await request.json();
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid reaction type' }, { status: 400 });
  }

  const reaction = await prisma.reaction.create({
    data: { type, roomId: params.roomId },
  });
  return NextResponse.json(reaction);
}
