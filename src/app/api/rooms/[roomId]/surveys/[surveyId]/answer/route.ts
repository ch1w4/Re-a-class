// アンケート投票 API
// POST /api/rooms/[roomId]/surveys/[surveyId]/answer
// 初回回答は votes を 1 増やし、回答済みの場合は締切前に選択肢を変更する。
// ロール: STUDENT のみ
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string; surveyId: string } }
) {
  const { error, user } = await requireAuth(request, ['STUDENT']);
  if (error) return error;

  const survey = await prisma.survey.findUnique({ where: { id: params.surveyId } });
  if (!survey || survey.roomId !== params.roomId || !survey.isOpen) {
    return NextResponse.json({ error: 'Survey not available' }, { status: 404 });
  }

  const { optionId } = await request.json();
  const option = await prisma.surveyOption.findUnique({ where: { id: optionId } });
  if (!option || option.surveyId !== params.surveyId) {
    return NextResponse.json({ error: 'Option not found' }, { status: 404 });
  }

  const existing = await prisma.surveyResponse.findUnique({
    where: { surveyId_userId: { surveyId: params.surveyId, userId: user!.id } },
  });

  if (!existing) {
    await prisma.$transaction([
      prisma.surveyResponse.create({
        data: { surveyId: params.surveyId, optionId, userId: user!.id },
      }),
      prisma.surveyOption.update({
        where: { id: optionId },
        data: { votes: { increment: 1 } },
      }),
    ]);
    return NextResponse.json({ success: true, optionId });
  }

  if (existing.optionId === optionId) {
    return NextResponse.json({ success: true, optionId });
  }

  await prisma.$transaction([
    prisma.surveyOption.update({
      where: { id: existing.optionId },
      data: { votes: { decrement: 1 } },
    }),
    prisma.surveyOption.update({
      where: { id: optionId },
      data: { votes: { increment: 1 } },
    }),
    prisma.surveyResponse.update({
      where: { id: existing.id },
      data: { optionId },
    }),
  ]);

  return NextResponse.json({ success: true, optionId });
}
