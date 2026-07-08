// アンケート投票 API
// POST /api/rooms/[roomId]/surveys/[surveyId]/answer
// 選択肢の votes を 1 増やす。isOpen=false（締め切り済み）の場合は拒否。
// ロール: 参加済みの STUDENT のみ。同一アンケートへの重複回答は拒否する。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { Prisma } from '@prisma/client';
import { getRoomScope, isEnrolledStudent } from '@/lib/roomAuthorization';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string; surveyId: string } }
) {
  const { error, user } = await requireAuth(request, ['STUDENT']);
  if (error) return error;

  const room = await getRoomScope(params.roomId, user!.id);
  if (!room || !isEnrolledStudent(user!, room)) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }
  if (room.endedAt) return NextResponse.json({ error: 'Room has ended' }, { status: 403 });

  const survey = await prisma.survey.findUnique({ where: { id: params.surveyId } });
  if (!survey || survey.roomId !== params.roomId || !survey.isOpen) {
    return NextResponse.json({ error: 'Survey not available' }, { status: 404 });
  }

  const { optionId } = await request.json();
  const option = await prisma.surveyOption.findUnique({ where: { id: optionId } });
  if (!option || option.surveyId !== params.surveyId) {
    return NextResponse.json({ error: 'Option not found' }, { status: 404 });
  }

  try {
    await prisma.$transaction([
      prisma.surveyResponse.create({
        data: {
          surveyId: params.surveyId,
          optionId,
          userId: user!.id,
        },
      }),
      prisma.surveyOption.update({
        where: { id: optionId },
        data: { votes: { increment: 1 } },
      }),
    ]);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Already answered' }, { status: 409 });
    }
    throw err;
  }
}
