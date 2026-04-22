// 通知既読化 API
// PATCH /api/notifications/[notifId]
// 指定した通知の isRead を true にする。
// 自分の通知のみ操作可能（userId フィルタ済み）。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { notifId: string } }
) {
  const { error, user } = await requireAuth(request);
  if (error) return error;

  await prisma.notification.updateMany({
    where: { id: params.notifId, userId: user!.id },
    data: { isRead: true },
  });
  return NextResponse.json({ ok: true });
}
