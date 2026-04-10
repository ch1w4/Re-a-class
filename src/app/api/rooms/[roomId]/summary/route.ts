import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
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

  const prompt = `あなたは授業のアシスタントです。以下の授業データをもとに、生徒が授業後に見返すための復習ノートを日本語で作成してください。

## 授業情報
- 授業名: ${room.name}
- 担当教師: ${room.teacherName}
- 実施日時: ${new Date(room.createdAt).toLocaleString('ja-JP')}
${room.endedAt ? `- 終了時刻: ${new Date(room.endedAt).toLocaleString('ja-JP')}` : ''}

## 授業音声の書き起こし
${transcriptSection}

## アンケート結果
${surveySection}

---

上記データをもとに、生徒が授業後に見返せる復習ノートを以下の構成で作成してください。
専門用語はわかりやすく補足し、箇条書きや見出しを活用して読みやすくしてください。

1. 今日の授業のポイント（授業で学んだ重要な内容を3〜5点に絞ってまとめる）
2. 詳しい内容（各ポイントの詳細説明。書き起こしをもとに、わかりやすく整理する）
3. 重要な用語・概念（授業中に出てきたキーワードと説明）
4. 確認問題（授業内容の理解を確かめるための問いを2〜3問。答えも記載）
${room.surveys.length > 0 ? '5. アンケート結果のまとめ（クラス全体の意見・傾向）' : ''}

Markdownで出力してください。`;

  try {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const response = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
    });
    const summary = response.choices[0].message.content ?? '';

    await prisma.room.update({
      where: { id: params.roomId },
      data: { summary },
    });

    return NextResponse.json({ summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Groq error:', message);
    return NextResponse.json({ error: `Groq エラー: ${message}` }, { status: 500 });
  }
}
