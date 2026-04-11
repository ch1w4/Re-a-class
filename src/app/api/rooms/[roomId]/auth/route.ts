// 教師トークン検証 API
// GET /api/rooms/[roomId]/auth?token=xxx
// ページロード時に localStorage のトークンが有効かどうかを確認するために使う。
// valid: true/false を返すだけのシンプルなエンドポイント。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ valid: false }, { status: 401 });

  const room = await prisma.room.findUnique({
    where: { id: params.roomId },
    select: { teacherToken: true },
  });
  if (!room || room.teacherToken !== token) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }
  return NextResponse.json({ valid: true });
}
