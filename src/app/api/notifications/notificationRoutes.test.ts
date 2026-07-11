import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/requireAuth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/prisma', () => ({
  prisma: { notification: { findMany: mocks.findMany, findFirst: mocks.findFirst, update: mocks.update } },
}));

import { GET } from './route';
import { PATCH } from './[notifId]/route';

beforeEach(() => vi.clearAllMocks());

describe('通知API', () => {
  it('教師本人の結果通知だけを取得し、同一リンクの重複を除外する', async () => {
    mocks.requireAuth.mockResolvedValue({ error: null, user: { id: 'teacher-1', role: 'TEACHER' } });
    const common = { type: 'UNDERSTANDING_RESULT', title: '結果', body: '本文', link: '/teacher/ROOM1', isRead: false };
    mocks.findMany.mockResolvedValue([
      { ...common, id: 'new', createdAt: new Date('2026-01-02') },
      { ...common, id: 'old', createdAt: new Date('2026-01-01') },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/notifications'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('new');
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'teacher-1', type: 'UNDERSTANDING_RESULT' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
  });

  it('他人または存在しない通知の既読化を404で拒否する', async () => {
    mocks.requireAuth.mockResolvedValue({ error: null, user: { id: 'student-1', role: 'STUDENT' } });
    mocks.findFirst.mockResolvedValue(null);
    const response = await PATCH(
      new NextRequest('http://localhost/api/notifications/other', { method: 'PATCH' }),
      { params: { notifId: 'other' } },
    );
    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('認証エラーをそのまま返す', async () => {
    const unauthorized = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mocks.requireAuth.mockResolvedValue({ error: unauthorized, user: null });
    const response = await GET(new NextRequest('http://localhost/api/notifications'));
    expect(response.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
