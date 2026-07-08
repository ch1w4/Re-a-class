// アンケート締め切り API
// POST /api/rooms/[roomId]/surveys/[surveyId]/close
// isOpen を false にして投票受付を終了する。
// ロール: TEACHER（自分のルームのみ）
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { getRoomScope, isRoomOwner } from '@/lib/roomAuthorization';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string; surveyId: string } }
) {
  const { error, user } = await requireAuth(request, ['TEACHER']);
  if (error) return error;

  const room = await getRoomScope(params.roomId, user!.id);
  if (!room || !isRoomOwner(user!, room)) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  const survey = await prisma.survey.findUnique({ where: { id: params.surveyId } });
  if (!survey || survey.roomId !== params.roomId) {
    return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
  }

  await prisma.survey.update({ where: { id: params.surveyId }, data: { isOpen: false } });
  return NextResponse.json({ success: true });
}
