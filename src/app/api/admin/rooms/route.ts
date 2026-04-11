// 管理者用ルーム一覧取得 API
// GET /api/admin/rooms
// 全ルームを作成日時の降順で返す。管理者パスワード必須（x-admin-password ヘッダー）。
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateAdminPassword } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = validateAdminPassword(request);
  if (authError) return authError;

  const rooms = await prisma.room.findMany({
    include: {
      messages: { select: { id: true } },
      reactions: { select: { id: true } },
      surveys: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // teacherToken は外部に公開しない
  const sanitized = rooms.map(({ teacherToken: _t, ...r }) => ({
    ...r,
    messageCount: r.messages.length,
    reactionCount: r.reactions.length,
    surveyCount: r.surveys.length,
  }));

  return NextResponse.json(sanitized);
}
