// 音声書き起こし API
// POST /api/rooms/[roomId]/transcribe
// 録音した音声ファイル（multipart/form-data の "audio" フィールド）を
// Groq Whisper (whisper-large-v3-turbo) で日本語テキストに変換する。
// 既存の transcript に追記する形で保存（複数回の録音に対応）。
// ロール: TEACHER（自分のルームのみ）/ SCHOOL_ADMIN / SERVER_ADMIN
// 環境変数 GROQ_API_KEY が必要。
import { NextRequest, NextResponse } from 'next/server';
import { createAIClient, WHISPER_MODEL } from '@/lib/ai';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['TEACHER', 'SCHOOL_ADMIN', 'SERVER_ADMIN']);
  if (error) return error;

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: 'GROQ_API_KEY が設定されていません' }, { status: 500 });
  }

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (user!.role === 'TEACHER' && room.teacherId !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const client = createAIClient();
  const formData = await request.formData();
  const audioFile = formData.get('audio') as File | null;
  if (!audioFile) return NextResponse.json({ error: 'No audio file' }, { status: 400 });

  const transcription = await client.audio.transcriptions.create({
    model: WHISPER_MODEL,
    file: audioFile,
    language: 'ja',
  });

  const newTranscript = room.transcript ? `${room.transcript}\n${transcription.text}` : transcription.text;
  await prisma.room.update({ where: { id: params.roomId }, data: { transcript: newTranscript } });
  return NextResponse.json({ transcript: newTranscript });
}
