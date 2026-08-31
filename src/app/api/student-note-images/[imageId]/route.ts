import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { getStudentNoteImageDir } from '@/lib/uploads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: { imageId: string } }) {
  const { error, user } = await requireAuth(request, ['STUDENT']);
  if (error) return error;

  const image = await prisma.studentNoteImage.findUnique({
    where: { id: params.imageId },
    select: { userId: true, fileName: true, mimeType: true },
  });
  if (!image || image.userId !== user!.id) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  const file = await fs.readFile(path.join(getStudentNoteImageDir(), image.fileName)).catch(() => null);
  if (!file) return NextResponse.json({ error: 'Image file not found' }, { status: 404 });

  return new NextResponse(file, {
    headers: { 'Content-Type': image.mimeType, 'Cache-Control': 'private, max-age=31536000, immutable' },
  });
}

export async function DELETE(request: NextRequest, { params }: { params: { imageId: string } }) {
  const { error, user } = await requireAuth(request, ['STUDENT']);
  if (error) return error;

  const image = await prisma.studentNoteImage.findUnique({ where: { id: params.imageId } });
  if (!image || image.userId !== user!.id) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }
  const room = await prisma.room.findUnique({ where: { id: image.roomId }, select: { endedAt: true } });
  if (room?.endedAt) return NextResponse.json({ error: 'Room has ended' }, { status: 409 });

  await prisma.studentNoteImage.delete({ where: { id: image.id } });
  await fs.unlink(path.join(getStudentNoteImageDir(), image.fileName)).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
