import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error } = await requireAuth(request, ['SERVER_ADMIN']);
  if (error) return error;

  const schools = await prisma.school.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(schools);
}

export async function POST(request: NextRequest) {
  const { error } = await requireAuth(request, ['SERVER_ADMIN']);
  if (error) return error;

  const { name, prefix } = await request.json();
  if (!name?.trim() || !prefix?.trim()) {
    return NextResponse.json({ error: '学校名とPrefixは必須です' }, { status: 400 });
  }

  const existing = await prisma.school.findUnique({ where: { prefix: prefix.trim().toUpperCase() } });
  if (existing) {
    return NextResponse.json({ error: 'このPrefixはすでに使用されています' }, { status: 409 });
  }

  const school = await prisma.school.create({
    data: { name: name.trim(), prefix: prefix.trim().toUpperCase() },
  });
  return NextResponse.json(school, { status: 201 });
}
