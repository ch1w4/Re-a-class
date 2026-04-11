// 音声書き起こし API
// POST /api/rooms/[roomId]/transcribe
// 録音した音声ファイル（webm/ogg）を受け取り、Groq Whisper large-v3 で日本語に書き起こす。
// 書き起こし結果は既存の transcript に改行区切りで追記される（複数回録音に対応）。
// 教師トークン必須。無料枠: 1日あたり2時間分の音声まで。
import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
// 長い音声ファイルに対応するためタイムアウトを60秒に設定
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { validateTeacherToken } = await import('@/lib/teacherAuth');
  const authError = await validateTeacherToken(request, params.roomId);
  if (authError) return authError;

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: 'GROQ_API_KEY が設定されていません' }, { status: 500 });
  }

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  // FormDataから音声ファイルを取得
  const formData = await request.formData();
  const audioFile = formData.get('audio') as File | null;
  if (!audioFile) return NextResponse.json({ error: 'No audio file' }, { status: 400 });

  let transcription;
  try {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    transcription = await client.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3',
      language: 'ja',
      response_format: 'text',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Groq Whisper error:', message);
    return NextResponse.json({ error: `書き起こしエラー: ${message}` }, { status: 500 });
  }

  // response_format: 'text' の場合は文字列、それ以外はオブジェクトで返ることがある
  const text = typeof transcription === 'string' ? transcription : (transcription as { text: string }).text;
  // 既存の書き起こしに追記（授業を分割して録音した場合に対応）
  const newTranscript = room.transcript ? `${room.transcript}\n${text.trim()}` : text.trim();

  await prisma.room.update({
    where: { id: params.roomId },
    data: { transcript: newTranscript },
  });

  return NextResponse.json({ transcript: newTranscript });
}
