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

  const notification = await prisma.notification.findFirst({
    where: { id: params.notifId, userId: user!.id },
    select: { id: true },
  });
  if (!notification) return NextResponse.json({ error: 'Notification not found' }, { status: 404 });

  const updated = await prisma.notification.update({
    where: { id: notification.id },
    data: { isRead: true },
    select: { id: true, type: true, title: true, body: true, link: true, isRead: true, createdAt: true },
  });
  return NextResponse.json(updated);
}
