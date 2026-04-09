import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string; surveyId: string } }
) {
  const survey = await prisma.survey.findUnique({
    where: { id: params.surveyId },
    include: { room: true },
  });
  if (!survey || survey.roomId !== params.roomId) {
    return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
  }
  if (!survey.isOpen) return NextResponse.json({ error: 'Survey is closed' }, { status: 403 });
  if (survey.room.endedAt) return NextResponse.json({ error: 'Room has ended' }, { status: 403 });

  const { optionId } = await request.json();

  await prisma.surveyOption.update({
    where: { id: optionId },
    data: { votes: { increment: 1 } },
  });
  return NextResponse.json({ success: true });
}
