// 理解度チェック集計 cron エンドポイント
// POST /api/cron/understanding-tally — x-cron-secret ヘッダーで認証
// tallyAt が現在時刻以前で、まだ talliedAt がない UnderstandingCheck を集計する。
// score 3〜4（「難しかった」「理解できなかった」）が回答者の 50% 超の場合、
// gpt-4o-mini でコメントをまとめ、担当教師に「UNDERSTANDING_RESULT」通知を送信する。
// 集計後は talliedAt を記録する。
// サーバー側の crontab 等で 1 時間ごとに呼び出す想定。
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  // tallyAt <= 現在 かつ まだ集計していない（talliedAt=null）かつ 通知済み（notifiedAt!=null）のチェックを取得
  const checks = await prisma.understandingCheck.findMany({
    where: { tallyAt: { lte: now }, talliedAt: null, notifiedAt: { not: null } },
    include: {
      room: { include: { teacher: { select: { id: true, displayName: true } } } },
      responses: { include: { user: { select: { displayName: true } } } },
    },
  });

  let tallied = 0;
  for (const check of checks) {
    const total = check.responses.length;

    // 回答者ゼロの場合は集計せずに talliedAt を記録して終了
    if (total === 0) {
      await prisma.understandingCheck.update({ where: { id: check.id }, data: { talliedAt: now } });
      continue;
    }

    // score >= 3（あまり理解できなかった / 全然理解できなかった）の割合を計算
    const poorCount = check.responses.filter((r) => r.score >= 3).length;
    const majority = poorCount / total > 0.5; // 50% 超なら教師に通知する

    if (majority && process.env.OPENAI_API_KEY) {
      // コメントが空でない回答のみ抽出してプロンプトに含める
      const comments = check.responses
        .filter((r) => r.comment.trim())
        .map((r) => `- ${r.comment}`)
        .join('\n');

      let aiSummary = '';
      try {
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const res = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{
            role: 'user',
            content: `授業「${check.room.name}」の理解度チェック結果です。\n回答者数: ${total}人\n未理解: ${poorCount}人\n\n生徒のコメント:\n${comments || '（なし）'}\n\n以上をもとに、教師向けに200字以内で丁寧にまとめてください。`,
          }],
          max_tokens: 300,
        });
        aiSummary = res.choices[0].message.content ?? '';
      } catch { /* AI 生成失敗時は aiSummary='' のままにして通知本文から省略 */ }

      const body = `「${check.room.name}」の理解度チェックで、${total}人中${poorCount}人が理解できなかったと回答しました。${aiSummary ? `\n\n${aiSummary}` : ''}`;

      // 担当教師へ UNDERSTANDING_RESULT 通知を送信（教師の授業画面へのリンク付き）
      await prisma.notification.create({
        data: {
          userId: check.room.teacher.id,
          type: 'UNDERSTANDING_RESULT',
          title: '理解度チェック結果のお知らせ',
          body,
          link: `/teacher/${check.room.id}`,
        },
      });
    }

    // 集計完了を記録（二重集計防止）
    await prisma.understandingCheck.update({ where: { id: check.id }, data: { talliedAt: now } });
    tallied++;
  }

  return NextResponse.json({ tallied });
}
