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

  await prisma.school.delete({ where: { id: params.schoolId } });
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
