// アンケート作成 API
// POST /api/rooms/[roomId]/surveys
// 教師がアンケートを作成する。質問文と2つ以上の選択肢が必要。教師トークン必須。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateTeacherToken } from '@/lib/teacherAuth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const authError = await validateTeacherToken(request, params.roomId);
  if (authError) return authError;

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (room.endedAt) return NextResponse.json({ error: 'Room has ended' }, { status: 403 });

  const { question, options } = await request.json();
  if (!question?.trim() || !Array.isArray(options) || options.length < 2) {
    return NextResponse.json({ error: 'Invalid survey data' }, { status: 400 });
  }

  // アンケートと選択肢を同時に作成する
  const survey = await prisma.survey.create({
    data: {
      question: question.trim(),
      roomId: params.roomId,
      options: {
        create: (options as string[])
          .filter((o) => o.trim())
          .map((text) => ({ text: text.trim() })),
      },
    },
    include: { options: true },
  });
  return NextResponse.json(survey);
}
