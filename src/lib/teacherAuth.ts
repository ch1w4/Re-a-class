import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';

/** リクエストヘッダー x-teacher-token を検証する。失敗時は NextResponse を返す。成功時は null。 */
export async function validateTeacherToken(
  request: NextRequest,
  roomId: string
): Promise<NextResponse | null> {
  const token = request.headers.get('x-teacher-token');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { teacherToken: true } });
  if (!room || room.teacherToken !== token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
