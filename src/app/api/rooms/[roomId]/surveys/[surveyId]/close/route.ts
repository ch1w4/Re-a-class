import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string; surveyId: string } }
) {
  const { error, user } = await requireAuth(request, ['TEACHER', 'SCHOOL_ADMIN', 'SERVER_ADMIN']);
  if (error) return error;

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (user!.role === 'TEACHER' && room.teacherId !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const survey = await prisma.survey.findUnique({ where: { id: params.surveyId } });
  if (!survey || survey.roomId !== params.roomId) {
    return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
  }

  await prisma.survey.update({ where: { id: params.surveyId }, data: { isOpen: false } });
  return NextResponse.json({ success: true });
}
