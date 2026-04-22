// アンケート投票 API
// POST /api/rooms/[roomId]/surveys/[surveyId]/answer
// 選択肢の votes を 1 増やす。isOpen=false（締め切り済み）の場合は拒否。
// ロール: ログイン済み全ユーザー（重複投票の制限はサーバー側では行わない）
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string; surveyId: string } }
) {
  const { error } = await requireAuth(request);
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

  await prisma.surveyOption.update({ where: { id: optionId }, data: { votes: { increment: 1 } } });
  return NextResponse.json({ success: true });
}
