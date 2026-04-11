// 管理者用授業終了 API
// POST /api/admin/rooms/[roomId]/end
// 指定ルームの endedAt をセットして授業を終了する。管理者パスワード必須。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateAdminPassword } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const authError = validateAdminPassword(request);
  if (authError) return authError;

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (room.endedAt) return NextResponse.json({ error: 'Already ended' }, { status: 400 });

  await prisma.room.update({
    where: { id: params.roomId },
    data: { endedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
