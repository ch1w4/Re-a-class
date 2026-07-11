import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { getRoomScope, isEnrolledStudent } from '@/lib/roomAuthorization';
import { getStudentNoteImageDir } from '@/lib/uploads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export async function POST(request: NextRequest, { params }: { params: { roomId: string } }) {
  const { error, user } = await requireAuth(request, ['STUDENT']);
  if (error) return error;

  const room = await getRoomScope(params.roomId, user!.id);
  if (!room || !isEnrolledStudent(user!, room)) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }
  if (room.endedAt) return NextResponse.json({ error: 'Room has ended' }, { status: 409 });

  const formData = await request.formData();
  const image = formData.get('image');
  if (!(image instanceof File)) {
    return NextResponse.json({ error: 'No image file' }, { status: 400 });
  }
  if (image.type !== 'image/png') {
    return NextResponse.json({ error: 'PNG画像のみアップロードできます' }, { status: 400 });
  }
  if (image.size <= 0 || image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: '画像サイズが大きすぎます' }, { status: 413 });
  }

  const buffer = Buffer.from(await image.arrayBuffer());
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < pngSignature.length || !buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    return NextResponse.json({ error: 'Invalid PNG image' }, { status: 400 });
  }

  const id = randomUUID();
  const fileName = `${id}.png`;
  const directory = getStudentNoteImageDir();
  const filePath = path.join(directory, fileName);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(filePath, buffer, { flag: 'wx' });

  try {
    await prisma.studentNoteImage.create({
      data: { id, userId: user!.id, roomId: params.roomId, fileName, mimeType: image.type, size: image.size },
    });
  } catch (cause) {
    await fs.unlink(filePath).catch(() => undefined);
    throw cause;
  }

  return NextResponse.json({ id, url: `/api/student-note-images/${id}` }, { status: 201 });
}
