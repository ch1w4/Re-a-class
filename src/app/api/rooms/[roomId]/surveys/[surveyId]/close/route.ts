// アンケート締め切り API
// POST /api/rooms/[roomId]/surveys/[surveyId]/close
// 教師がアンケートを締め切る（isOpen を false にする）。教師トークン必須。
// 締め切り後は生徒から投票できなくなるが、結果は引き続き表示される。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateTeacherToken } from '@/lib/teacherAuth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string; surveyId: string } }
) {
  const authError = await validateTeacherToken(request, params.roomId);
  if (authError) return authError;

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
