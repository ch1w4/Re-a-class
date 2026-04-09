import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (room.endedAt) return NextResponse.json({ error: 'Room has ended' }, { status: 403 });

  const updated = await prisma.room.update({
    where: { id: params.roomId },
    data: { chatEnabled: !room.chatEnabled },
  });
  return NextResponse.json({ chatEnabled: updated.chatEnabled });
}
