import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { teacherName, roomName } = await request.json();
  if (!teacherName || !roomName) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  const id = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
  const room = await prisma.room.create({
    data: { id, name: roomName, teacherName },
    include: { messages: true, reactions: true, surveys: { include: { options: true } } },
  });
  return NextResponse.json(room);
}

export async function GET() {
  const rooms = await prisma.room.findMany({
    include: { messages: true, reactions: true, surveys: { include: { options: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(rooms);
}
