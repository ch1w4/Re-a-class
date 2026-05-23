// 生徒個人メモ API
// GET   /api/rooms/[roomId]/student-note — 自分のメモを取得する
// PATCH /api/rooms/[roomId]/student-note — 自分のメモを保存する
// ロール: STUDENT のみ。教師・管理者には公開しない個人メモとして扱う。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

async function findRoomForStudent(roomId: string, schoolId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, schoolId: true },
  });
  if (!room || room.schoolId !== schoolId) return null;
  return room;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['STUDENT']);
  if (error) return error;

  const room = await findRoomForStudent(params.roomId, user!.schoolId);
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  const note = await prisma.studentNote.findUnique({
    where: { userId_roomId: { userId: user!.id, roomId: params.roomId } },
    select: { body: true, updatedAt: true },
  });

  return NextResponse.json({
    body: note?.body ?? '',
    updatedAt: note?.updatedAt?.toISOString() ?? null,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['STUDENT']);
  if (error) return error;

  const room = await findRoomForStudent(params.roomId, user!.schoolId);
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  const { body } = await request.json().catch(() => ({}));
  if (typeof body !== 'string') {
    return NextResponse.json({ error: 'Invalid note body' }, { status: 400 });
  }

  const note = await prisma.studentNote.upsert({
    where: { userId_roomId: { userId: user!.id, roomId: params.roomId } },
    update: { body },
    create: { userId: user!.id, roomId: params.roomId, body },
    select: { updatedAt: true },
  });

  return NextResponse.json({ ok: true, updatedAt: note.updatedAt.toISOString() });
}
