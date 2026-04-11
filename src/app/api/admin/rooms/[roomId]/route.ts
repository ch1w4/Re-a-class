// 管理者用ルーム削除 API
// DELETE /api/admin/rooms/[roomId]
// 指定ルームとその全関連データ（チャット・リアクション・アンケート）を削除する。
// 管理者パスワード必須（x-admin-password ヘッダー）。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateAdminPassword } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const authError = validateAdminPassword(request);
  if (authError) return authError;

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  // cascade 設定により関連データ（messages, reactions, surveys）も自動削除される
  await prisma.room.delete({ where: { id: params.roomId } });

  return NextResponse.json({ success: true });
}
