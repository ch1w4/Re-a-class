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
    if (total === 0) {
      await prisma.understandingCheck.update({ where: { id: check.id }, data: { talliedAt: now } });
      continue;
    }

    const poorCount = check.responses.filter((r) => r.score >= 3).length;
    const majority = poorCount / total > 0.5;

    if (majority && process.env.OPENAI_API_KEY) {
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
      } catch { /* fallback */ }

      const body = `「${check.room.name}」の理解度チェックで、${total}人中${poorCount}人が理解できなかったと回答しました。${aiSummary ? `\n\n${aiSummary}` : ''}`;

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

    await prisma.understandingCheck.update({ where: { id: check.id }, data: { talliedAt: now } });
    tallied++;
  }

  return NextResponse.json({ tallied });
}
