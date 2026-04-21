// 理解度チェック API（生徒用）
// GET  /api/rooms/[roomId]/understanding
//   現在のチェックが active かどうか、自分がすでに回答したかを返す。
//   active=true: notifiedAt が設定済みかつ talliedAt がまだの状態。
// POST /api/rooms/[roomId]/understanding
//   score（1〜4）と任意コメントを受け取って回答を保存する。二重回答は拒否。
//   score 1=よく理解できた, 2=理解できた, 3=少し難しかった, 4=理解できなかった
// ロール: GET = 全ログイン済みユーザー、POST = STUDENT のみ
// チェックのスケジュール: 授業終了から 4 日後に cron で通知される。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request);
  if (error) return error;

  const check = await prisma.understandingCheck.findUnique({
    where: { roomId: params.roomId },
    include: { responses: { where: { userId: user!.id }, select: { id: true } } },
  });

  if (!check || !check.notifiedAt) return NextResponse.json({ active: false, answered: false });

  return NextResponse.json({
    active: !check.talliedAt,
    answered: check.responses.length > 0,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['STUDENT']);
  if (error) return error;

  const check = await prisma.understandingCheck.findUnique({ where: { roomId: params.roomId } });
  if (!check || !check.notifiedAt) {
    return NextResponse.json({ error: 'チェックが見つかりません' }, { status: 404 });
  }

  const existing = await prisma.understandingCheckResponse.findUnique({
    where: { checkId_userId: { checkId: check.id, userId: user!.id } },
  });
  if (existing) return NextResponse.json({ error: 'すでに回答済みです' }, { status: 409 });

  const { score, comment } = await request.json();
  if (typeof score !== 'number' || score < 1 || score > 4) {
    return NextResponse.json({ error: 'scoreは1〜4の整数です' }, { status: 400 });
  }

  await prisma.understandingCheckResponse.create({
    data: { checkId: check.id, userId: user!.id, score, comment: comment?.trim() ?? '' },
  });
  return NextResponse.json({ ok: true });
}
