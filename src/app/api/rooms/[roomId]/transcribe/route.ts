import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY が設定されていません' }, { status: 500 });
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  const formData = await request.formData();
  const audioFile = formData.get('audio') as File | null;
  if (!audioFile) return NextResponse.json({ error: 'No audio file' }, { status: 400 });

  // Whisper に送信
  const transcription = await client.audio.transcriptions.create({
    model: 'whisper-1',
    file: audioFile,
    language: 'ja',
  });

  const newTranscript = room.transcript
    ? `${room.transcript}\n${transcription.text}`
    : transcription.text;

  await prisma.room.update({
    where: { id: params.roomId },
    data: { transcript: newTranscript },
  });

  return NextResponse.json({ transcript: newTranscript });
}
