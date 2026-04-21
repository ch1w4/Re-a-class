// 学校管理者用 ユーザー削除・パスワードリセット API
// DELETE /api/school-admin/users/[userId] — ユーザーを削除する
// PATCH  /api/school-admin/users/[userId] — パスワードをユーザー ID にリセットする
// 他校のユーザーへの操作は拒否（schoolId でフィルタ）。
// ロール: SCHOOL_ADMIN / SERVER_ADMIN
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { hashPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const { error, user } = await requireAuth(request, ['SCHOOL_ADMIN', 'SERVER_ADMIN']);
  if (error) return error;

  const target = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!target || target.schoolId !== user!.schoolId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.user.delete({ where: { id: params.userId } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const { error, user } = await requireAuth(request, ['SCHOOL_ADMIN', 'SERVER_ADMIN']);
  if (error) return error;

  const target = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!target || target.schoolId !== user!.schoolId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: params.userId },
    data: { passwordHash: hashPassword(params.userId) },
  });
  return NextResponse.json({ ok: true });
}
