// ルーム詳細取得・授業終了・ルーム削除 API
// GET    /api/rooms/[roomId]             — ロールに応じた最小限のルーム情報を返す
// DELETE /api/rooms/[roomId]             — endedAt をセットして授業を終了する。授業終了と同時に
//                                         「理解度チェック」を 4 日後にスケジュールする。
// DELETE /api/rooms/[roomId]?mode=delete — ルームを物理削除する（cascade でデータも全削除）
//                                         ロール: TEACHER（自分のルームのみ）
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { getRoomScope, isEnrolledStudent, isRoomOwner, isSchoolRoomAdmin } from '@/lib/roomAuthorization';
import { roomHeaderSelect, studentRoomDetailSelect } from '@/lib/roomProjections';

export const dynamic = 'force-dynamic';

// 教師本人だけに返す授業運営用データ
const teacherInclude = {
  reactions: { orderBy: { timestamp: 'asc' as const } },
  surveys: { include: { options: true }, orderBy: { createdAt: 'asc' as const } },
  teacher: { select: { displayName: true } },
  understandingCheck: { 
    select: { 
      scheduledAt: true, 
      notifiedAt: true, 
      tallyAt: true, 
      talliedAt: true, 
      resultBody: true,
      responses: {
        select: {
          id: true,
          comment: true
        }
      }
    } 
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['TEACHER', 'STUDENT', 'SCHOOL_ADMIN']);
  if (error) return error;

  const scope = await getRoomScope(params.roomId, user!.id);
  if (!scope) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  if (isRoomOwner(user!, scope)) {
    const room = await prisma.room.findUnique({
      where: { id: params.roomId },
      include: teacherInclude,
    });
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    return NextResponse.json(room);
  }

  if (isEnrolledStudent(user!, scope)) {
    const room = await prisma.room.findUnique({
      where: { id: params.roomId },
      select: studentRoomDetailSelect,
    });
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    return NextResponse.json(room);
  }

  if (isSchoolRoomAdmin(user!, scope)) {
    const room = await prisma.room.findUnique({
      where: { id: params.roomId },
      select: roomHeaderSelect,
    });
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    return NextResponse.json(room);
  }

  return NextResponse.json({ error: 'Room not found' }, { status: 404 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['TEACHER']);
  if (error) return error;

  const room = await getRoomScope(params.roomId, user!.id);
  if (!room || !isRoomOwner(user!, room)) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  // ?mode=delete の場合はルームを物理削除する（cascade で関連データも全削除）
  if (request.nextUrl.searchParams.get('mode') === 'delete') {
    await prisma.room.delete({ where: { id: params.roomId } });
    return NextResponse.json({ ok: true });
  }

  // 既に終了済みのルームを二重終了しようとしても弾く
  if (room.endedAt) return NextResponse.json({ error: 'Already ended' }, { status: 400 });

  const endedAt = new Date();
  const updated = await prisma.room.update({
    where: { id: params.roomId },
    data: { endedAt },
    include: teacherInclude,
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
