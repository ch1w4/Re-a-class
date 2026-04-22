// 授業フィードバックレポート生成 API（教師専用）
// POST /api/rooms/[roomId]/summary
// Groq llama-3.3-70b-versatile を使って教師向けフィードバックレポートを Markdown 形式で自動生成し DB に保存する。
// プロンプトには「音声書き起こし・リアクション集計・アンケート結果」を含める。
// 生成内容: 授業の振り返り・生徒の反応傾向・次回授業への改善アドバイス（教師が読む想定）
// ロール: TEACHER（自分のルームのみ）/ SCHOOL_ADMIN / SERVER_ADMIN
// 環境変数 GROQ_API_KEY が必要（未設定なら 500 を返す）。
import { NextRequest, NextResponse } from 'next/server';
import { createAIClient, CHAT_MODEL } from '@/lib/ai';
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

  const room = await prisma.room.findUnique({
    where: { id: params.roomId },
    include: { reactions: true, surveys: { include: { options: true } }, teacher: { select: { displayName: true } } },
  });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (user!.role === 'TEACHER' && room.teacherId !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const client = createAIClient();
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

  const prompt = `あなたは教育支援AIです。以下のデータをもとに、担当教師「${room.teacher.displayName}」先生向けの授業フィードバックレポートをMarkdown形式で作成してください。\n\n授業名: ${room.name}\n実施日時: ${new Date(room.createdAt).toLocaleString('ja-JP')}\n\n## 音声書き起こし\n${room.transcript || '（なし）'}\n\n## リアクション集計\n${reactionSummary}\n\n## アンケート結果\n${surveySection}\n\n---\n\n【作成するレポートの構成】\n1. **授業の振り返り** — 書き起こしをもとに授業内容を簡潔に整理\n2. **生徒の反応傾向** — リアクション・アンケートから読み取れる生徒の理解度・関心度\n3. **気になる点・課題** — 「わからない」「ゆっくり」など懸念リアクションの分析\n4. **次回授業への改善アドバイス** — 具体的で実践しやすい提案を3点程度\n\n教師が授業改善に役立てることを目的としたレポートです。生徒には公開しません。`;

  const response = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1500,
  });

  const summary = response.choices[0].message.content ?? '';
  await prisma.room.update({ where: { id: params.roomId }, data: { summary } });
  return NextResponse.json({ summary });
}
