// ルーム一覧取得・新規作成 API
// POST /api/rooms — 教師が新しい授業ルームを作成する（ロール: TEACHER）
// GET  /api/rooms — ロールによって返すデータが変わる
//   TEACHER      : 自分が作成したルーム一覧
//   STUDENT      : 自分が参加したルーム一覧（担当教師名付き）
//   SCHOOL_ADMIN/SERVER_ADMIN : 同一学校内の全ルーム一覧
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { error, user } = await requireAuth(request, ['TEACHER']);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const name = body.name?.trim() || '無題の授業';

  const id = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
  const room = await prisma.room.create({
    data: { id, name, schoolId: user!.schoolId, teacherId: user!.id },
    include: { messages: true, reactions: true, surveys: { include: { options: true } }, enrollments: true },
  });
  return NextResponse.json(room, { status: 201 });
}

export async function GET(request: NextRequest) {
  const { error, user } = await requireAuth(request);
  if (error) return error;

  if (user!.role === 'TEACHER') {
    const rooms = await prisma.room.findMany({
      where: { teacherId: user!.id },
      include: { _count: { select: { enrollments: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(rooms);
  }

  if (user!.role === 'STUDENT') {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: user!.id },
      include: {
        room: {
          include: {
            teacher: { select: { displayName: true } },
            _count: { select: { enrollments: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
    return NextResponse.json(enrollments.map((e) => e.room));
  }

  if (user!.role === 'SCHOOL_ADMIN' || user!.role === 'SERVER_ADMIN') {
    const rooms = await prisma.room.findMany({
      where: { schoolId: user!.schoolId },
      include: { teacher: { select: { displayName: true } }, _count: { select: { enrollments: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(rooms);
  }

  return NextResponse.json([]);
}
