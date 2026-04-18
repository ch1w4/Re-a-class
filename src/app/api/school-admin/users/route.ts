import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { hashPassword } from '@/lib/auth';
import { generateUserId } from '@/lib/userId';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error, user } = await requireAuth(request, ['SCHOOL_ADMIN', 'SERVER_ADMIN']);
  if (error) return error;

  const users = await prisma.user.findMany({
    where: { schoolId: user!.schoolId },
    orderBy: { id: 'asc' },
    select: { id: true, displayName: true, role: true, createdAt: true },
  });
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const { error, user } = await requireAuth(request, ['SCHOOL_ADMIN', 'SERVER_ADMIN']);
  if (error) return error;

  const { displayName, role } = await request.json();
  if (!displayName?.trim()) {
    return NextResponse.json({ error: '名前は必須です' }, { status: 400 });
  }
  const allowedRoles: Role[] = ['TEACHER', 'STUDENT'];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: '無効なロールです' }, { status: 400 });
  }

  const id = await generateUserId(user!.schoolId);
  const newUser = await prisma.user.create({
    data: {
      id,
      schoolId: user!.schoolId,
      role,
      displayName: displayName.trim(),
      passwordHash: hashPassword(id),
    },
  });
  return NextResponse.json({ id: newUser.id, displayName: newUser.displayName, role: newUser.role }, { status: 201 });
}
