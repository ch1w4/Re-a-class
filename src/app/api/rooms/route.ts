// ルーム一覧取得・ルーム新規作成 API
// POST /api/rooms → 新しい授業ルームを作成し、教師トークンを返す
// GET  /api/rooms → 全ルームを作成日時の降順で返す
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { teacherName, roomName } = await request.json();
  if (!teacherName || !roomName) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  // ルームIDは8文字の大文字英数字、教師トークンはUUID（認証用）
  const id = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
  const teacherToken = uuidv4().replace(/-/g, '');
  const room = await prisma.room.create({
    data: { id, name: roomName, teacherName, teacherToken },
    include: { messages: true, reactions: true, surveys: { include: { options: true } } },
  });
  return NextResponse.json({ ...room, teacherToken });
}

export async function GET() {
  const rooms = await prisma.room.findMany({
    include: { messages: true, reactions: true, surveys: { include: { options: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(rooms);
}
