import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { getRoomScope, isEnrolledStudent, isRoomOwner } from '@/lib/roomAuthorization';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { roomId: string } }) {
  const { error, user } = await requireAuth(request, ['TEACHER', 'STUDENT']);
  if (error) return error;
  const room = await getRoomScope(params.roomId, user!.id);
  if (!room || (!isRoomOwner(user!, room) && !isEnrolledStudent(user!, room))) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  const check = await prisma.liveUnderstandingCheck.findFirst({
    where: { roomId: params.roomId, endedAt: null }, orderBy: { startedAt: 'desc' }, include: { responses: true },
  });
  if (!check) return NextResponse.json({ active: false });
  if (user!.role === 'TEACHER') return NextResponse.json({
    active: true, id: check.id, startedAt: check.startedAt,
    understood: check.responses.filter((r) => r.understood).length,
    confused: check.responses.filter((r) => !r.understood).length,
    answered: check.responses.length,
  });
  return NextResponse.json({ active: true, id: check.id, answered: check.responses.some((r) => r.userId === user!.id) });
}

export async function POST(request: NextRequest, { params }: { params: { roomId: string } }) {
  const { error, user } = await requireAuth(request, ['TEACHER', 'STUDENT']);
  if (error) return error;
  const room = await getRoomScope(params.roomId, user!.id);
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (user!.role === 'TEACHER') {
    if (!isRoomOwner(user!, room)) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    if (room.endedAt) return NextResponse.json({ error: 'Room has ended' }, { status: 403 });
    const check = await prisma.$transaction(async (tx) => {
      await tx.liveUnderstandingCheck.updateMany({ where: { roomId: params.roomId, endedAt: null }, data: { endedAt: new Date() } });
      return tx.liveUnderstandingCheck.create({ data: { roomId: params.roomId } });
    });
    return NextResponse.json(check, { status: 201 });
  }
  if (!isEnrolledStudent(user!, room)) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  const { checkId, understood } = await request.json();
  if (typeof checkId !== 'string' || typeof understood !== 'boolean') return NextResponse.json({ error: 'Invalid response' }, { status: 400 });
  const check = await prisma.liveUnderstandingCheck.findFirst({ where: { id: checkId, roomId: params.roomId, endedAt: null } });
  if (!check) return NextResponse.json({ error: 'Check is not active' }, { status: 410 });
  await prisma.liveUnderstandingCheckResponse.upsert({
    where: { checkId_userId: { checkId, userId: user!.id } },
    update: {}, create: { checkId, userId: user!.id, understood },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
