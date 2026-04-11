// アンケート回答 API
// POST /api/rooms/[roomId]/surveys/[surveyId]/answer
// 生徒がアンケートの選択肢に投票する。
// アンケートが締め切られている・授業が終了している場合は受け付けない。
// 二重投票防止はフロントエンド側のstateで管理している（サーバー側には防止機構なし）。
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

  // 選択肢の票数を1増やす
  await prisma.surveyOption.update({
    where: { id: optionId },
    data: { votes: { increment: 1 } },
  });
  return NextResponse.json({ success: true });
}
