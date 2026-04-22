// サーバー管理者用 学校削除・学校管理者作成 API
// DELETE /api/server-admin/schools/[schoolId]
//   学校を完全削除する。トランザクション内で掲示板・理解度回答・
//   ルーム・ユーザーをすべて削除してから学校レコードを削除する。
// POST /api/server-admin/schools/[schoolId]
//   その学校の SCHOOL_ADMIN ユーザーを新規作成する（ID 自動採番、初期PW=ID）。
// ロール: SERVER_ADMIN のみ
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { hashPassword } from '@/lib/auth';
import { generateUserId } from '@/lib/userId';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { schoolId: string } }
) {
  const { error } = await requireAuth(request, ['SERVER_ADMIN']);
  if (error) return error;

  await prisma.$transaction(async (tx) => {
    const users = await tx.user.findMany({ where: { schoolId: params.schoolId }, select: { id: true } });
    const userIds = users.map((u) => u.id);

    await tx.boardPost.deleteMany({ where: { userId: { in: userIds } } });
    await tx.understandingCheckResponse.deleteMany({ where: { userId: { in: userIds } } });
    await tx.room.deleteMany({ where: { schoolId: params.schoolId } });
    await tx.user.deleteMany({ where: { schoolId: params.schoolId } });
    await tx.school.delete({ where: { id: params.schoolId } });
  });

  return NextResponse.json({ ok: true });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { schoolId: string } }
) {
  const { error } = await requireAuth(request, ['SERVER_ADMIN']);
  if (error) return error;

  const { displayName } = await request.json();
  if (!displayName?.trim()) {
    return NextResponse.json({ error: '名前は必須です' }, { status: 400 });
  }

  const id = await generateUserId(params.schoolId);
  const user = await prisma.user.create({
    data: {
      id,
      schoolId: params.schoolId,
      role: 'SCHOOL_ADMIN',
      displayName: displayName.trim(),
      passwordHash: hashPassword(id),
    },
  });
  return NextResponse.json({ id: user.id, displayName: user.displayName, role: user.role }, { status: 201 });
}
