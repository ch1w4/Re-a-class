// 授業後の匿名掲示板 API
// GET  /api/rooms/[roomId]/board — 投稿一覧を取得。授業終了後のみ閲覧可能。
//   STUDENT/一般ユーザーは authorLabel に匿名ラベル（userId+roomId の SHA256 ハッシュ由来）を使用。
//   SCHOOL_ADMIN/SERVER_ADMIN は実名を表示。
// POST /api/rooms/[roomId]/board — 生徒が感想・質問を投稿する。授業終了後のみ。
// ロール: GET = STUDENT / SCHOOL_ADMIN / SERVER_ADMIN、POST = STUDENT のみ
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

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
    authorLabel: isAdmin ? p.user.displayName : anonLabel(p.userId, params.roomId),
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
  if (!room.endedAt) return NextResponse.json({ error: '授業終了後のみ投稿できます' }, { status: 403 });

  const { content } = await request.json();
  if (!content?.trim()) return NextResponse.json({ error: 'Empty content' }, { status: 400 });

  const post = await prisma.boardPost.create({
    data: { content: content.trim(), userId: user!.id, roomId: params.roomId },
  });
  return NextResponse.json({ id: post.id, content: post.content, authorLabel: anonLabel(user!.id, params.roomId), createdAt: post.createdAt }, { status: 201 });
}
