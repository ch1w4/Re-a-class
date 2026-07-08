// 教師メモ更新 API
// PATCH /api/rooms/[roomId]/notes
// 教師が授業メモ（板書・補足など）をリアルタイムで保存する。
// ロール: TEACHER（自分のルームのみ）
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { getRoomScope, isRoomOwner } from '@/lib/roomAuthorization';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['TEACHER']);
  if (error) return error;

  const room = await getRoomScope(params.roomId, user!.id);
  if (!room || !isRoomOwner(user!, room)) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  const { notes } = await request.json();
  if (typeof notes !== 'string') return NextResponse.json({ error: 'Invalid notes' }, { status: 400 });

  const updated = await prisma.room.update({ where: { id: params.roomId }, data: { notes } });
  return NextResponse.json({ notes: updated.notes });
}
