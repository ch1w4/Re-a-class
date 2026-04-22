// リアクション送信 API
// POST /api/rooms/[roomId]/reactions
// ログイン済みの全ユーザーが送信可能。授業終了後は拒否。
// type: "understood" | "confused" | "question" | "slow" | "fast"
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error } = await requireAuth(request);
  if (error) return error;

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (room.endedAt) return NextResponse.json({ error: 'Room has ended' }, { status: 403 });

  const { type } = await request.json();
  const reaction = await prisma.reaction.create({ data: { type, roomId: params.roomId } });
  return NextResponse.json(reaction, { status: 201 });
}
