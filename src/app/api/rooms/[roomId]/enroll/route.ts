// 授業参加登録 API
// POST /api/rooms/[roomId]/enroll
// 生徒が授業ルームに参加したときに Enrollment レコードを作成する（upsert = 重複登録防止）。
// ホーム画面の「参加した講義」一覧に表示するために使用する。
// ロール: STUDENT のみ
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { getRoomScope } from '@/lib/roomAuthorization';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['STUDENT']);
  if (error) return error;

  const room = await getRoomScope(params.roomId, user!.id);
  if (!room || room.schoolId !== user!.schoolId) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  // 終了済みルームは既存参加者だけが再入室できる。
  if (room.enrolled) return NextResponse.json({ ok: true });
  if (room.endedAt) {
    return NextResponse.json({ error: 'Room has ended' }, { status: 403 });
  }

  await prisma.enrollment.upsert({
    where: { userId_roomId: { userId: user!.id, roomId: params.roomId } },
    update: {},
    create: { userId: user!.id, roomId: params.roomId },
  });

  return NextResponse.json({ ok: true });
}
