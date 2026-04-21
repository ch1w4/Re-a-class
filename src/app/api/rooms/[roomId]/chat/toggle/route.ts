// チャット有効/無効 切り替え API
// POST /api/rooms/[roomId]/chat/toggle
// 教師がチャット受付をオン/オフする。現在の chatEnabled を反転して返す。
// ロール: TEACHER（自分のルームのみ）/ SCHOOL_ADMIN / SERVER_ADMIN
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['TEACHER', 'SCHOOL_ADMIN', 'SERVER_ADMIN']);
  if (error) return error;

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (user!.role === 'TEACHER' && room.teacherId !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (room.endedAt) return NextResponse.json({ error: 'Room has ended' }, { status: 403 });

  const updated = await prisma.room.update({
    where: { id: params.roomId },
    data: { chatEnabled: !room.chatEnabled },
  });
  return NextResponse.json({ chatEnabled: updated.chatEnabled });
}
