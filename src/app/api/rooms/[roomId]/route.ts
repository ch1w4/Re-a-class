// ルーム詳細取得・授業終了 API
// GET    /api/rooms/[roomId] → ルームの全データ（チャット・リアクション・アンケート）を返す
// DELETE /api/rooms/[roomId] → 授業を終了（endedAt をセット）。教師トークン必須。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateTeacherToken } from '@/lib/teacherAuth';

export const dynamic = 'force-dynamic';

// 関連データを全て含めて取得するための共通オプション
const includeAll = {
  messages: { orderBy: { timestamp: 'asc' as const } },
  reactions: { orderBy: { timestamp: 'asc' as const } },
  surveys: { include: { options: true }, orderBy: { createdAt: 'asc' as const } },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const room = await prisma.room.findUnique({
    where: { id: params.roomId },
    include: includeAll,
  });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  // teacherToken は外部に公開しない
  const { teacherToken: _t, ...roomData } = room;
  return NextResponse.json(roomData);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const authError = await validateTeacherToken(request, params.roomId);
  if (authError) return authError;

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (room.endedAt) return NextResponse.json({ error: 'Already ended' }, { status: 400 });

  const updated = await prisma.room.update({
    where: { id: params.roomId },
    data: { endedAt: new Date() },
    include: includeAll,
  });
  return NextResponse.json(updated);
}
