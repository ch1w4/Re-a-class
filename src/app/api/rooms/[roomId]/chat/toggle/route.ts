// チャット開放/閉鎖切り替え API
// POST /api/rooms/[roomId]/chat/toggle
// 教師がチャットの受付状態をトグルする。教師トークン必須。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateTeacherToken } from '@/lib/teacherAuth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const authError = await validateTeacherToken(request, params.roomId);
  if (authError) return authError;

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (room.endedAt) return NextResponse.json({ error: 'Room has ended' }, { status: 403 });

  // 現在の状態を反転させる
  const updated = await prisma.room.update({
    where: { id: params.roomId },
    data: { chatEnabled: !room.chatEnabled },
  });
  return NextResponse.json({ chatEnabled: updated.chatEnabled });
}
