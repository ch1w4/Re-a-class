// アンケート作成 API
// POST /api/rooms/[roomId]/surveys
// 質問文と選択肢（2 つ以上）を受け取り、アンケートを作成する。
// 作成後は isOpen=true で投票受付開始。授業終了後は作成不可。
// ロール: TEACHER（自分のルームのみ）/ SCHOOL_ADMIN / SERVER_ADMIN
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { makeSurveyOptionId, surveyOptionsOrderBy } from '@/lib/surveyOptions';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['TEACHER', 'SCHOOL_ADMIN', 'SERVER_ADMIN']);
  if (error) return error;

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (user!.role === 'TEACHER' && room.teacherId !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (room.endedAt) return NextResponse.json({ error: 'Room has ended' }, { status: 403 });

  const { question, options } = await request.json();
  if (!question?.trim() || !Array.isArray(options) || options.length < 2) {
    return NextResponse.json({ error: 'Invalid survey data' }, { status: 400 });
  }

  const surveyId = uuidv4();
  const trimmedOptions = (options as string[]).filter((o) => o.trim()).map((text) => text.trim());
  const survey = await prisma.survey.create({
    data: {
      id: surveyId,
      question: question.trim(),
      roomId: params.roomId,
      options: {
        create: trimmedOptions.map((text, i) => ({
          id: makeSurveyOptionId(surveyId, i),
          text,
        })),
      },
    },
    include: { options: { orderBy: surveyOptionsOrderBy } },
  });
  return NextResponse.json(survey, { status: 201 });
}
