// 授業後の匿名掲示板 API
// GET  /api/rooms/[roomId]/board — 投稿一覧を取得。授業終了後のみ閲覧可能。
//   STUDENT は authorLabel に匿名ラベル（SHA256(userId:roomId) から生成）を使用。
//   SCHOOL_ADMIN / SERVER_ADMIN は実名表示（管理者モード）。
// POST /api/rooms/[roomId]/board — 生徒が感想・質問を投稿する。授業終了後のみ。
// ロール: GET = STUDENT / SCHOOL_ADMIN / SERVER_ADMIN、POST = STUDENT のみ
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

// 匿名ラベルに使用する文字セット（62 文字）
const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// userId と roomId から決定論的な匿名ラベルを生成する。
// SHA256(userId:roomId) の先頭 8 文字を数値変換して LABELS の添字にする。
// 同じユーザーが同じルームで何度投稿しても同じラベルになるため、
// 管理者以外には投稿者を特定できないが投稿の一貫性は保たれる。
function anonLabel(userId: string, roomId: string): string {
  const hash = createHash('sha256').update(`${userId}:${roomId}`).digest('hex');
  const n = parseInt(hash.slice(0, 8), 16) % LABELS.length;
  return `生徒${LABELS[n]}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['STUDENT', 'SCHOOL_ADMIN', 'SERVER_ADMIN']);
  if (error) return error;

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  // 授業終了前は掲示板を閲覧不可（授業中のネタバレ・荒らし防止）
  if (!room.endedAt) return NextResponse.json({ error: '授業終了後のみ閲覧できます' }, { status: 403 });

  const posts = await prisma.boardPost.findMany({
    where: { roomId: params.roomId },
    include: { user: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const isAdmin = user!.role === 'SCHOOL_ADMIN' || user!.role === 'SERVER_ADMIN';

  return NextResponse.json(posts.map((p) => ({
    id: p.id,
    content: p.content,
    createdAt: p.createdAt,
    // 管理者は実名、生徒は匿名ラベルを返す
    authorLabel: isAdmin ? p.user.displayName : anonLabel(p.userId, params.roomId),
    // 管理者向けのみ authorId を追加（必要に応じて追加調査できるように）
    ...(isAdmin ? { authorId: p.user.id } : {}),
  })));
}

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error, user } = await requireAuth(request, ['STUDENT']);
  if (error) return error;

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  // 授業終了前の投稿は拒否（終了後専用の掲示板のため）
  if (!room.endedAt) return NextResponse.json({ error: '授業終了後のみ投稿できます' }, { status: 403 });

  const { content } = await request.json();
  if (!content?.trim()) return NextResponse.json({ error: 'Empty content' }, { status: 400 });

  const post = await prisma.boardPost.create({
    data: { content: content.trim(), userId: user!.id, roomId: params.roomId },
  });
  // レスポンスには authorLabel を含める（フロントエンドが即時表示できるように）
  return NextResponse.json({ id: post.id, content: post.content, authorLabel: anonLabel(user!.id, params.roomId), createdAt: post.createdAt }, { status: 201 });
}
