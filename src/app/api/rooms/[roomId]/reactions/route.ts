// リアクション送信 API
// POST /api/rooms/[roomId]/reactions
// 生徒が5種類のリアクション（understood/confused/question/slow/fast）を送信する。
// 授業が終了していない場合のみ受け付ける。認証不要（生徒からの操作）。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// 有効なリアクション種別の一覧
const VALID_TYPES = ['understood', 'confused', 'question', 'slow', 'fast'];

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (room.endedAt) return NextResponse.json({ error: 'Room has ended' }, { status: 403 });

  const { type } = await request.json();
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid reaction type' }, { status: 400 });
  }

  const reaction = await prisma.reaction.create({
    data: { type, roomId: params.roomId },
  });
  return NextResponse.json(reaction);
}
