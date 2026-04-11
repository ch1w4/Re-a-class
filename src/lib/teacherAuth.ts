// 教師専用エンドポイントの認証ヘルパー。
// リクエストヘッダー「x-teacher-token」を検証し、
// 一致しない場合は 401 レスポンスを返す。
// 成功時は null を返すので、呼び出し元で if (authError) return authError; と使う。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';

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
