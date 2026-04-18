import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

export async function POST(
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
  if (room.endedAt) return NextResponse.json({ error: 'Room has ended' }, { status: 403 });

  const { question, options } = await request.json();
  if (!question?.trim() || !Array.isArray(options) || options.length < 2) {
    return NextResponse.json({ error: 'Invalid survey data' }, { status: 400 });
  }

  const survey = await prisma.survey.create({
    data: {
      question: question.trim(),
      roomId: params.roomId,
      options: { create: (options as string[]).filter((o) => o.trim()).map((text) => ({ text: text.trim() })) },
    },
    include: { options: true },
  });
  return NextResponse.json(survey, { status: 201 });
}
