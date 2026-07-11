// リアクション送信 API
// POST /api/rooms/[roomId]/reactions
// 参加済みの生徒のみ送信可能。授業終了後は拒否。
// type: "slow" | "fast"
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { getRoomScope, isEnrolledStudent } from '@/lib/roomAuthorization';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['STUDENT']);
  if (error) return error;

  const room = await getRoomScope(params.roomId, user!.id);
  if (!room || !isEnrolledStudent(user!, room)) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }
  if (room.endedAt) return NextResponse.json({ error: 'Room has ended' }, { status: 403 });

  const { type } = await request.json();
  if (type !== 'slow' && type !== 'fast') {
    return NextResponse.json({ error: 'Invalid reaction type' }, { status: 400 });
  }
  const reaction = await prisma.reaction.create({ data: { type, roomId: params.roomId } });
  return NextResponse.json(reaction, { status: 201 });
}
