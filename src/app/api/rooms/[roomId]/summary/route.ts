import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['TEACHER', 'SCHOOL_ADMIN', 'SERVER_ADMIN']);
  if (error) return error;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY が設定されていません' }, { status: 500 });
  }

  const room = await prisma.room.findUnique({
    where: { id: params.roomId },
    include: { reactions: true, surveys: { include: { options: true } }, teacher: { select: { displayName: true } } },
  });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (user!.role === 'TEACHER' && room.teacherId !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const counts = room.reactions.reduce<Record<string, number>>((acc, r) => { acc[r.type] = (acc[r.type] ?? 0) + 1; return acc; }, {});

  const reactionSummary = [
    `👍 理解した: ${counts['understood'] ?? 0}件`,
    `🤔 わからない: ${counts['confused'] ?? 0}件`,
    `✋ 質問あり: ${counts['question'] ?? 0}件`,
    `🐢 もっとゆっくり: ${counts['slow'] ?? 0}件`,
    `🚀 もっと速く: ${counts['fast'] ?? 0}件`,
    `合計: ${room.reactions.length}件`,
  ].join('\n');

  const surveySection = room.surveys.length > 0
    ? room.surveys.map((s) => {
        const total = s.options.reduce((sum, o) => sum + o.votes, 0);
        const opts = s.options.map((o) => `  - ${o.text}: ${o.votes}票 (${total > 0 ? Math.round(o.votes / total * 100) : 0}%)`).join('\n');
        return `Q: ${s.question}\n${opts}\n合計: ${total}票`;
      }).join('\n\n')
    : 'なし';

  const prompt = `授業名: ${room.name}\n担当: ${room.teacher.displayName}\n実施日時: ${new Date(room.createdAt).toLocaleString('ja-JP')}\n\n## 音声書き起こし\n${room.transcript || '（なし）'}\n\n## リアクション\n${reactionSummary}\n\n## アンケート\n${surveySection}\n\n以上をもとに日本語で授業要約レポートをMarkdown形式で作成してください（授業概要・理解度分析・改善点）。`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1500,
  });

  const summary = response.choices[0].message.content ?? '';
  await prisma.room.update({ where: { id: params.roomId }, data: { summary } });
  return NextResponse.json({ summary });
}
