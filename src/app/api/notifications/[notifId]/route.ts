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
