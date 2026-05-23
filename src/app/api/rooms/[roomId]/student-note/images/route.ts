// 生徒メモ画像アップロード API
// POST /api/rooms/[roomId]/student-note/images
// 手書きメモの PNG をファイルとして保存し、メモ本文へ挿入するためのURLを返す。
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { getStudentNoteImageDir } from '@/lib/uploads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['STUDENT']);
  if (error) return error;

  const room = await prisma.room.findUnique({
    where: { id: params.roomId },
    select: { id: true, schoolId: true },
  });
  if (!room || room.schoolId !== user!.schoolId) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

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

  const id = randomUUID();
  const fileName = `${id}.png`;
  const dir = getStudentNoteImageDir();
  const filePath = path.join(dir, fileName);
  const buffer = Buffer.from(await image.arrayBuffer());

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, buffer, { flag: 'wx' });

  const record = await prisma.studentNoteImage.create({
    data: {
      id,
      userId: user!.id,
      roomId: params.roomId,
      fileName,
      mimeType: image.type,
      size: image.size,
    },
    select: { id: true },
  });

  return NextResponse.json({
    id: record.id,
    url: `/api/student-note-images/${record.id}`,
  }, { status: 201 });
}
