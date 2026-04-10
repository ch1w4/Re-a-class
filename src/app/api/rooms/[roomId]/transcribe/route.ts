import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { validateTeacherToken } = await import('@/lib/teacherAuth');
  const authError = await validateTeacherToken(request, params.roomId);
  if (authError) return authError;

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  const { text } = await request.json();
  if (!text?.trim()) return NextResponse.json({ error: 'No text' }, { status: 400 });

  const newTranscript = room.transcript
    ? `${room.transcript}\n${text.trim()}`
    : text.trim();

  await prisma.room.update({
    where: { id: params.roomId },
    data: { transcript: newTranscript },
  });

  return NextResponse.json({ transcript: newTranscript });
}
