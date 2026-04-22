// ──────────────────────────────────────────────
// デモ用・時間スキップ API（コンテスト発表・動作確認用）
// ──────────────────────────────────────────────
// POST /api/debug/advance-time
//
// 理解度チェックの「4 日後に通知 → 当日締め切り → 集計」という流れを
// その場で即実行するためのデモ用エンドポイント。
// /home 右下の「⏩ 時間をスキップ」ボタンから呼び出される。
//
// 処理の流れ:
//   ① 未通知 & scheduledAt が未来のチェック → scheduledAt を 1 秒前に前倒し
//   ② 通知済み & tallyAt が未来のチェック  → tallyAt を 1 秒前に前倒し
//   ③ understanding-notify の処理をインラインで実行（生徒に通知を送信）
//   ④ understanding-tally の処理をインラインで実行（集計 → 教師に結果通知）
//   ⑤ 実行した件数とメッセージを返す
//
// ※ このエンドポイントは認証なしで誰でも呼べる。本番環境では削除または保護すること。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAIClient, CHAT_MODEL } from '@/lib/ai';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const now = new Date();

  // ① 未通知のチェックで scheduledAt が未来のものを「今」に前倒し
  await prisma.understandingCheck.updateMany({
    where: { notifiedAt: null, scheduledAt: { gt: now } },
    data: { scheduledAt: new Date(now.getTime() - 1000) },
  });

  // ② 通知済みで tallyAt が未来のものを「今」に前倒し
  await prisma.understandingCheck.updateMany({
    where: { notifiedAt: { not: null }, talliedAt: null, tallyAt: { gt: now } },
    data: { tallyAt: new Date(now.getTime() - 1000) },
  });

  // ③ understanding-notify の処理をインラインで実行
  const toNotify = await prisma.understandingCheck.findMany({
    where: { scheduledAt: { lte: now }, notifiedAt: null },
    include: { room: { include: { enrollments: { select: { userId: true } } } } },
  });

  let notified = 0;
  for (const check of toNotify) {
    const studentIds = check.room.enrollments.map((e) => e.userId);
    if (studentIds.length === 0) continue;
    await prisma.notification.createMany({
      data: studentIds.map((userId) => ({
        userId,
        type: 'UNDERSTANDING_CHECK' as const,
        title: '理解度チェック',
        body: `「${check.room.name}」の理解度チェックに回答してください`,
        link: `/student/${check.room.id}?tab=understanding`,
      })),
    });
    const tallyAt = new Date(now);
    tallyAt.setUTCHours(24, 0, 0, 0);
    await prisma.understandingCheck.update({
      where: { id: check.id },
      data: { notifiedAt: now, tallyAt },
    });
    notified++;
  }

  // ④ understanding-tally の処理をインラインで実行
  const toTally = await prisma.understandingCheck.findMany({
    where: { tallyAt: { lte: now }, talliedAt: null, notifiedAt: { not: null } },
    include: {
      room: { include: { teacher: { select: { id: true, displayName: true } } } },
      responses: { include: { user: { select: { displayName: true } } } },
    },
  });

  let tallied = 0;
  for (const check of toTally) {
    const total = check.responses.length;

    if (total === 0) {
      await prisma.notification.create({
        data: {
          userId: check.room.teacher.id,
          type: 'UNDERSTANDING_RESULT',
          title: '理解度チェック結果のお知らせ',
          body: `「${check.room.name}」の理解度チェックへの回答がありませんでした。`,
          link: `/teacher/${check.room.id}`,
        },
      });
      await prisma.understandingCheck.update({ where: { id: check.id }, data: { talliedAt: now, resultBody: '回答者: 0人（未回答）' } });
      tallied++;
      continue;
    }

    const s1 = check.responses.filter((r) => r.score === 1).length;
    const s2 = check.responses.filter((r) => r.score === 2).length;
    const s3 = check.responses.filter((r) => r.score === 3).length;
    const s4 = check.responses.filter((r) => r.score === 4).length;
    const poorCount = s3 + s4;
    const majority = poorCount / total > 0.5;

    const pct = (n: number) => total > 0 ? Math.round(n / total * 100) : 0;
    let resultBody = `回答者: ${total}人\n😄 よく理解できた: ${s1}人 (${pct(s1)}%)\n🙂 だいたい理解できた: ${s2}人 (${pct(s2)}%)\n😕 あまり理解できなかった: ${s3}人 (${pct(s3)}%)\n😢 全然理解できなかった: ${s4}人 (${pct(s4)}%)`;

    let aiSummary = '';
    if (majority && process.env.GROQ_API_KEY) {
      const comments = check.responses
        .filter((r) => r.score >= 3 && r.comment.trim())
        .map((r) => `- ${r.comment}`)
        .join('\n');
      try {
        const client = createAIClient();
        const res = await client.chat.completions.create({
          model: CHAT_MODEL,
          messages: [{ role: 'user', content: `授業「${check.room.name}」の理解度チェックで、${total}人中${poorCount}人が理解できなかったと回答しました。\n\n理解できなかった生徒のコメント:\n${comments || '（コメントなし）'}\n\n教師向けに「何が理解されなかったか」を200字以内で具体的にまとめてください。` }],
          max_tokens: 300,
        });
        aiSummary = res.choices[0].message.content ?? '';
      } catch { /* AI 失敗時はサマリーなし */ }
      if (aiSummary) resultBody += `\n\n【生徒コメント要約（AI）】\n${aiSummary}`;
    }

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
    await prisma.understandingCheck.update({ where: { id: check.id }, data: { talliedAt: now, resultBody } });
    tallied++;
  }

  return NextResponse.json({
    ok: true,
    notified,
    tallied,
    message: notified > 0
      ? `${notified}件の理解度チェックを生徒に送信しました`
      : tallied > 0
      ? `${tallied}件の理解度チェックを集計し、先生に結果を通知しました`
      : '現在スキップできる処理はありません',
  });
}
