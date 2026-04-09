import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: { roomId: string; surveyId: string } }
) {
  const survey = await prisma.survey.findUnique({ where: { id: params.surveyId } });
  if (!survey || survey.roomId !== params.roomId) {
    return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
  }

  await prisma.survey.update({
    where: { id: params.surveyId },
    data: { isOpen: false },
  });
  return NextResponse.json({ success: true });
}
