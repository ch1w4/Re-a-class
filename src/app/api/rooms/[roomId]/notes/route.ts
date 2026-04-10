import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateTeacherToken } from '@/lib/teacherAuth';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const authError = await validateTeacherToken(request, params.roomId);
  if (authError) return authError;

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  const { notes } = await request.json();
  if (typeof notes !== 'string') return NextResponse.json({ error: 'Invalid notes' }, { status: 400 });

  const updated = await prisma.room.update({
    where: { id: params.roomId },
    data: { notes },
  });
  return NextResponse.json({ notes: updated.notes });
}
