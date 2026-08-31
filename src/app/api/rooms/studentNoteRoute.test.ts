import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ requireAuth: vi.fn(), getRoomScope: vi.fn(), upsert: vi.fn() }));
vi.mock('@/lib/requireAuth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/roomAuthorization', async () => {
  const actual = await vi.importActual<typeof import('@/lib/roomAuthorization')>('@/lib/roomAuthorization');
  return { ...actual, getRoomScope: mocks.getRoomScope };
});
vi.mock('@/lib/prisma', () => ({ prisma: { studentNote: { upsert: mocks.upsert, findUnique: vi.fn() } } }));

import { PATCH } from './[roomId]/student-note/route';

const request = () => new NextRequest('http://localhost/api/rooms/ROOM1/student-note', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: '<p>memo</p>' }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ error: null, user: { id: 'student-1', schoolId: 'school-1', role: 'STUDENT' } });
});

describe('生徒メモ保存API', () => {
  it('授業終了後の更新を409で拒否する', async () => {
    mocks.getRoomScope.mockResolvedValue({ id: 'ROOM1', schoolId: 'school-1', teacherId: 'teacher-1', enrolled: true, endedAt: new Date() });
    const response = await PATCH(request(), { params: { roomId: 'ROOM1' } });
    expect(response.status).toBe(409);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('未参加または他校の生徒の更新を404で拒否する', async () => {
    mocks.getRoomScope.mockResolvedValue({ id: 'ROOM1', schoolId: 'school-2', teacherId: 'teacher-1', enrolled: true, endedAt: null });
    const response = await PATCH(request(), { params: { roomId: 'ROOM1' } });
    expect(response.status).toBe(404);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
