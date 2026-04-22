// ──────────────────────────────────────────────
// 理解度チェック API（生徒用）
// ──────────────────────────────────────────────
// GET  /api/rooms/[roomId]/understanding
//   チェックの現在状態とタイミング情報を返す。
//   active=true: 通知済み（notifiedAt あり）かつ提出期限前（tallyAt 未到来 & talliedAt なし）
//   UI でのカウントダウン表示のため scheduledAt / notifiedAt / tallyAt / talliedAt も返す。
//
// POST /api/rooms/[roomId]/understanding
//   score（1〜4）と任意コメントを受け取って回答を保存する。
//   以下の場合は拒否:
//     - 二重回答（409 Conflict）
//     - 提出期限（tallyAt）を過ぎている or 集計済み（410 Gone）
//     - score が 1〜4 の整数以外（400 Bad Request）
//   score 1=よく理解できた / 2=だいたい理解できた / 3=あまり理解できなかった / 4=全然理解できなかった
//   score 3/4 の生徒のみコメントを送信する（フロント側で制御、サーバー側は保存するだけ）。
//
// ロール: GET = 全ログイン済みユーザー、POST = STUDENT のみ
// スケジュール: 授業終了の 4 日後に通知 → 提出期限は通知当日の深夜 0 時（UTC）
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  // 全ログイン済みユーザーが参照可能（教師も生徒もタイミングを確認できる）
  const { error, user } = await requireAuth(request);
  if (error) return error;

  // responses は自分の回答のみ取得（answered フラグの判定に使用、内容は不要）
  const check = await prisma.understandingCheck.findUnique({
    where: { roomId: params.roomId },
    include: { responses: { where: { userId: user!.id }, select: { id: true } } },
  });

  // チェック自体が存在しない場合（授業がまだ終了していないなど）
  if (!check) return NextResponse.json({
    active: false, answered: false,
    scheduledAt: null, notifiedAt: null, tallyAt: null, talliedAt: null,
  });

  const now = new Date();
  // 提出期限判定: 集計済み OR tallyAt が現在時刻以前 → 期限終了
  const deadlinePassed = !!(check.talliedAt || (check.tallyAt && check.tallyAt <= now));

  return NextResponse.json({
    active: !deadlinePassed && !!check.notifiedAt,  // 通知済み & 期限内 の場合のみ true
    answered: check.responses.length > 0,          // 自分が回答済みかどうか
    scheduledAt: check.scheduledAt.toISOString(),   // 通知予定日時（UI カウントダウン用）
    notifiedAt: check.notifiedAt?.toISOString() ?? null,  // 実際に通知した日時
    tallyAt: check.tallyAt?.toISOString() ?? null,        // 提出締め切り日時
    talliedAt: check.talliedAt?.toISOString() ?? null,    // 集計完了日時
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  // 回答できるのは STUDENT のみ（教師・管理者は回答不可）
  const { error, user } = await requireAuth(request, ['STUDENT']);
  if (error) return error;

  // チェックの存在確認（notifiedAt がない = まだ通知されていない → 回答不可）
  const check = await prisma.understandingCheck.findUnique({ where: { roomId: params.roomId } });
  if (!check || !check.notifiedAt) {
    return NextResponse.json({ error: 'チェックが見つかりません' }, { status: 404 });
  }

  // 提出期限チェック: tallyAt を過ぎているか、既に集計済みなら回答を受け付けない
  if (check.talliedAt || (check.tallyAt && check.tallyAt <= new Date())) {
    return NextResponse.json({ error: '回答期限が終了しています' }, { status: 410 });
  }

  // 二重回答チェック: 複合ユニーク（checkId + userId）で検索
  const existing = await prisma.understandingCheckResponse.findUnique({
    where: { checkId_userId: { checkId: check.id, userId: user!.id } },
  });
  if (existing) return NextResponse.json({ error: 'すでに回答済みです' }, { status: 409 });

  const { score, comment } = await request.json();

  // score は 1〜4 の整数のみ許可
  if (typeof score !== 'number' || score < 1 || score > 4) {
    return NextResponse.json({ error: 'scoreは1〜4の整数です' }, { status: 400 });
  }

  // comment は score 3/4 の場合のみフロントから送られる（サーバー側は保存するだけ）
  await prisma.understandingCheckResponse.create({
    data: { checkId: check.id, userId: user!.id, score, comment: comment?.trim() ?? '' },
  });
  return NextResponse.json({ ok: true });
}
