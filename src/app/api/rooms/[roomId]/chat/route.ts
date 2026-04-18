import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

async function polishMessage(raw: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return raw;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `次のメッセージを、授業中に教師へ送る丁寧で優しい言葉に変換してください。元の意味を変えず、自然な敬語にしてください。変換後の文章のみ返してください：「${raw}」`,
      }],
      max_tokens: 200,
    }, { signal: controller.signal });
    return res.choices[0].message.content ?? raw;
  } catch {
    return raw;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['STUDENT']);
  if (error) return error;

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (room.endedAt) return NextResponse.json({ error: 'Room has ended' }, { status: 403 });
  if (!room.chatEnabled) return NextResponse.json({ error: 'Chat disabled' }, { status: 403 });

  const { content: rawContent } = await request.json();
  if (!rawContent?.trim()) return NextResponse.json({ error: 'Empty message' }, { status: 400 });

  const content = await polishMessage(rawContent.trim());

  const message = await prisma.chatMessage.create({
    data: { content, rawContent: rawContent.trim(), userId: user!.id, roomId: params.roomId },
    include: { user: { select: { displayName: true } } },
  });
  return NextResponse.json(message, { status: 201 });
}
