import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY が設定されていません' }, { status: 500 });
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const room = await prisma.room.findUnique({
    where: { id: params.roomId },
    include: {
      reactions: true,
      surveys: { include: { options: true } },
    },
  });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  const counts = room.reactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] ?? 0) + 1;
    return acc;
  }, {});

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
        const opts = s.options.map((o) => {
          const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
          return `  - ${o.text}: ${o.votes}票 (${pct}%)`;
        }).join('\n');
        return `Q: ${s.question}\n${opts}\n合計: ${total}票`;
      }).join('\n\n')
    : 'なし';

  const transcriptSection = room.transcript.trim() || '（音声書き起こしなし）';

  const prompt = `あなたは授業のアシスタントです。以下の授業データをもとに、日本語で授業要約レポートを作成してください。

## 授業情報
- 授業名: ${room.name}
- 担当教師: ${room.teacherName}
- 実施日時: ${new Date(room.createdAt).toLocaleString('ja-JP')}
${room.endedAt ? `- 終了時刻: ${new Date(room.endedAt).toLocaleString('ja-JP')}` : ''}

## 授業音声の書き起こし
${transcriptSection}

## 生徒のリアクション集計
${reactionSummary}

## アンケート結果
${surveySection}

---

上記データをもとに、以下の構成で授業要約レポートを日本語で作成してください：
1. 授業概要（音声書き起こしをもとに、何を教えたかを簡潔にまとめる）
2. 生徒の理解度分析（リアクションから読み取れる生徒の状態）
3. アンケートから得られた知見（アンケートがある場合のみ）
4. 次回への改善点・提言

Markdownで出力してください。`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1500,
  });

  const summary = response.choices[0].message.content ?? '';

  await prisma.room.update({
    where: { id: params.roomId },
    data: { summary },
  });

  return NextResponse.json({ summary });
}
