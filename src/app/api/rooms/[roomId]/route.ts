// ルーム詳細取得・授業終了 API
// GET    /api/rooms/[roomId] — チャット・リアクション・アンケートを含む全データを返す
// DELETE /api/rooms/[roomId] — endedAt をセットして授業を終了する。授業終了と同時に
//                              「理解度チェック」を 4 日後にスケジュールする。
//                              ロール: TEACHER（自分のルームのみ）/ SCHOOL_ADMIN / SERVER_ADMIN
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

// GET でルームデータを取得する際に常に含めるリレーション定義
const includeAll = {
  reactions: { orderBy: { timestamp: 'asc' as const } },
  surveys: { include: { options: true }, orderBy: { createdAt: 'asc' as const } },
  teacher: { select: { displayName: true } },
  enrollments: { select: { userId: true } },
  _count: { select: { students: true } },
};

export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  // 全ログイン済みユーザーが参照可能（ロール制限なし）
  const { error } = await requireAuth(request);
  if (error) return error;

  const room = await prisma.room.findUnique({ where: { id: params.roomId }, include: includeAll });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  return NextResponse.json({
    ...room,
    studentCount: (room as any)._count?.students ?? 0,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['TEACHER', 'SCHOOL_ADMIN', 'SERVER_ADMIN']);
  if (error) return error;

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  // TEACHER は自分が作成したルームのみ終了できる
  if (user!.role === 'TEACHER' && room.teacherId !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // 既に終了済みのルームを二重終了しようとしても弾く
  if (room.endedAt) return NextResponse.json({ error: 'Already ended' }, { status: 400 });

  const endedAt = new Date();
  const updated = await prisma.room.update({
    where: { id: params.roomId },
    data: { endedAt },
    include: includeAll,
  });

  // 授業終了と同時に理解度チェックを 4 日後にスケジュールする。
  // upsert を使うことで cleanup cron が終了した場合との重複作成を防ぐ。
  await prisma.understandingCheck.upsert({
    where: { roomId: params.roomId },
    update: {}, // 既に存在する場合は何も変更しない
    create: {
      roomId: params.roomId,
      scheduledAt: new Date(endedAt.getTime() + 4 * 24 * 60 * 60 * 1000),
    },
  });

  return NextResponse.json(updated);
}
