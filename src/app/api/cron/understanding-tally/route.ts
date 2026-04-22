// 理解度チェック集計 cron エンドポイント
// POST /api/cron/understanding-tally — x-cron-secret ヘッダーで認証
// tallyAt が現在時刻以前で、まだ talliedAt がない UnderstandingCheck を集計する。
// 結果はどんな場合でも必ず担当教師に「UNDERSTANDING_RESULT」通知を送信する。
// score 3〜4（「難しかった」「理解できなかった」）が回答者の 50% 超の場合のみ、
// gpt-4o-mini でコメントをまとめて通知本文に追加する。
// 集計後は talliedAt を記録する。
// サーバー側の crontab 等で 1 時間ごとに呼び出す想定。
import { NextRequest, NextResponse } from 'next/server';
import { createAIClient, CHAT_MODEL } from '@/lib/ai';
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

    // 回答者ゼロの場合も先生に通知して talliedAt を記録する
    if (total === 0) {
      const resultBody = '回答者: 0人（未回答）';
      await prisma.notification.create({
        data: {
          userId: check.room.teacher.id,
          type: 'UNDERSTANDING_RESULT',
          title: '理解度チェック結果のお知らせ',
          body: `「${check.room.name}」の理解度チェックへの回答がありませんでした。`,
          link: `/teacher/${check.room.id}`,
        },
      });
      await prisma.understandingCheck.update({ where: { id: check.id }, data: { talliedAt: now, resultBody } });
      tallied++;
      continue;
    }

    // スコア別の集計
    const s1 = check.responses.filter((r) => r.score === 1).length;
    const s2 = check.responses.filter((r) => r.score === 2).length;
    const s3 = check.responses.filter((r) => r.score === 3).length;
    const s4 = check.responses.filter((r) => r.score === 4).length;
    const poorCount = s3 + s4; // score 3/4 = 理解できなかった側
    const majority = poorCount / total > 0.5; // 50% 超なら AI コメント要約を生成

    const pct = (n: number) => total > 0 ? Math.round(n / total * 100) : 0;
    let resultBody = `回答者: ${total}人\n😄 よく理解できた: ${s1}人 (${pct(s1)}%)\n🙂 だいたい理解できた: ${s2}人 (${pct(s2)}%)\n😕 あまり理解できなかった: ${s3}人 (${pct(s3)}%)\n😢 全然理解できなかった: ${s4}人 (${pct(s4)}%)`;

    let aiSummary = '';
    if (majority && process.env.GROQ_API_KEY) {
      // score 3/4 の生徒の「何が理解できなかったか」コメントを要約
      const comments = check.responses
        .filter((r) => r.score >= 3 && r.comment.trim())
        .map((r) => `- ${r.comment}`)
        .join('\n');

      try {
        const client = createAIClient();
        const res = await client.chat.completions.create({
          model: CHAT_MODEL,
          messages: [{
            role: 'user',
            content: `授業「${check.room.name}」の理解度チェックで、${total}人中${poorCount}人が理解できなかったと回答しました。\n\n理解できなかった生徒のコメント:\n${comments || '（コメントなし）'}\n\n以上をもとに、教師向けに「何が理解されなかったか」を200字以内で具体的にまとめてください。`,
          }],
          max_tokens: 300,
        });
        aiSummary = res.choices[0].message.content ?? '';
      } catch { /* AI 生成失敗時は空のままスコア結果のみ保存 */ }

      if (aiSummary) resultBody += `\n\n【生徒コメント要約（AI）】\n${aiSummary}`;
    }

    // 結果は必ず先生へ通知する
    const notifBody = majority
      ? `「${check.room.name}」: ${total}人中${poorCount}人が理解できなかったと回答しました。授業ページで詳細を確認してください。`
      : `「${check.room.name}」: ${total}人中${poorCount}人が理解できなかったと回答しました。`;

    await prisma.notification.create({
      data: {
        userId: check.room.teacher.id,
        type: 'UNDERSTANDING_RESULT',
        title: '理解度チェック結果のお知らせ',
        body: notifBody,
        link: `/teacher/${check.room.id}`,
      },
    });

    // 集計完了と resultBody を同時に保存（二重集計防止）
    await prisma.understandingCheck.update({ where: { id: check.id }, data: { talliedAt: now, resultBody } });
    tallied++;
  }

  return NextResponse.json({ tallied });
}
