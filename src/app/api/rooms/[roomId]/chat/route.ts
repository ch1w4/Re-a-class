import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (room.endedAt) return NextResponse.json({ error: 'Room has ended' }, { status: 403 });
  if (!room.chatEnabled) return NextResponse.json({ error: 'Chat is disabled' }, { status: 403 });

  const { content, studentId } = await request.json();
  if (!content?.trim()) return NextResponse.json({ error: 'Empty message' }, { status: 400 });
  if (!studentId?.trim()) return NextResponse.json({ error: 'Missing studentId' }, { status: 400 });

  const message = await prisma.chatMessage.create({
    data: { content: content.trim(), studentId, roomId: params.roomId },
  });
  return NextResponse.json(message);
}
