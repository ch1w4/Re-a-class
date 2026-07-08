import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { buildStudentRoomDetailSelect } from '@/lib/roomProjections';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getRoomScope: vi.fn(),
  roomFindUnique: vi.fn(),
  reactionCreate: vi.fn(),
}));

vi.mock('@/lib/requireAuth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/roomAuthorization', async () => {
  const actual = await vi.importActual<typeof import('@/lib/roomAuthorization')>('@/lib/roomAuthorization');
  return { ...actual, getRoomScope: mocks.getRoomScope };
});
vi.mock('@/lib/prisma', () => ({
  prisma: {
    room: { findUnique: mocks.roomFindUnique },
    reaction: { create: mocks.reactionCreate },
  },
}));

import { GET as getRoom } from './[roomId]/route';
import { POST as postReaction } from './[roomId]/reactions/route';

const params = { params: { roomId: 'ROOM0001' } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ルームAPI認可', () => {
  it('教師による生徒リアクションを403で拒否する', async () => {
    const forbidden = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    mocks.requireAuth.mockResolvedValue({ error: forbidden, user: null });

    const response = await postReaction(
      new NextRequest('http://localhost/api/rooms/ROOM0001/reactions', { method: 'POST' }),
      params,
    );

    expect(response.status).toBe(403);
    expect(mocks.requireAuth).toHaveBeenCalledWith(expect.any(NextRequest), ['STUDENT']);
    expect(mocks.getRoomScope).not.toHaveBeenCalled();
  });

  it('他校の生徒によるルーム操作を404で拒否する', async () => {
    const student = { id: 'student-1', schoolId: 'school-a', role: 'STUDENT' as const };
    mocks.requireAuth.mockResolvedValue({ error: null, user: student });
    mocks.getRoomScope.mockResolvedValue({
      id: 'ROOM0001',
      schoolId: 'school-b',
      teacherId: 'teacher-1',
      endedAt: null,
      enrolled: true,
    });

    const response = await postReaction(
      new NextRequest('http://localhost/api/rooms/ROOM0001/reactions', { method: 'POST' }),
      params,
    );

    expect(response.status).toBe(404);
    expect(mocks.reactionCreate).not.toHaveBeenCalled();
  });

  it('未参加の生徒によるルーム詳細取得を404で拒否する', async () => {
    const student = { id: 'student-1', schoolId: 'school-a', role: 'STUDENT' as const };
    mocks.requireAuth.mockResolvedValue({ error: null, user: student });
    mocks.getRoomScope.mockResolvedValue({
      id: 'ROOM0001',
      schoolId: 'school-a',
      teacherId: 'teacher-1',
      endedAt: null,
      enrolled: false,
    });

    const response = await getRoom(
      new NextRequest('http://localhost/api/rooms/ROOM0001'),
      params,
    );

    expect(response.status).toBe(404);
    expect(mocks.roomFindUnique).not.toHaveBeenCalled();
  });

  it('生徒向け詳細を安全なselectだけで取得する', async () => {
    const student = { id: 'student-1', schoolId: 'school-a', role: 'STUDENT' as const };
    const safeRoom = {
      id: 'ROOM0001',
      name: '数学',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      endedAt: null,
      teacher: { displayName: '教師A' },
      surveys: [],
    };
    mocks.requireAuth.mockResolvedValue({ error: null, user: student });
    mocks.getRoomScope.mockResolvedValue({
      id: 'ROOM0001',
      schoolId: 'school-a',
      teacherId: 'teacher-1',
      endedAt: null,
      enrolled: true,
    });
    mocks.roomFindUnique.mockResolvedValue(safeRoom);

    const response = await getRoom(
      new NextRequest('http://localhost/api/rooms/ROOM0001'),
      params,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.roomFindUnique).toHaveBeenCalledWith({
      where: { id: 'ROOM0001' },
      select: buildStudentRoomDetailSelect(student.id),
    });
    expect(body).not.toHaveProperty('notes');
    expect(body).not.toHaveProperty('summary');
    expect(body).not.toHaveProperty('understandingCheck');
  });

  it('他校の学校管理者による詳細取得を404で拒否する', async () => {
    const admin = { id: 'admin-1', schoolId: 'school-a', role: 'SCHOOL_ADMIN' as const };
    mocks.requireAuth.mockResolvedValue({ error: null, user: admin });
    mocks.getRoomScope.mockResolvedValue({
      id: 'ROOM0001',
      schoolId: 'school-b',
      teacherId: 'teacher-1',
      endedAt: new Date(),
      enrolled: false,
    });

    const response = await getRoom(
      new NextRequest('http://localhost/api/rooms/ROOM0001'),
      params,
    );

    expect(response.status).toBe(404);
    expect(mocks.roomFindUnique).not.toHaveBeenCalled();
  });
});
