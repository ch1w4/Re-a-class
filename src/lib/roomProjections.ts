import type { Prisma } from '@prisma/client';

export const studentRoomDetailSelect = {
  id: true,
  name: true,
  createdAt: true,
  endedAt: true,
  teacher: { select: { displayName: true } },
  surveys: {
    include: { options: true },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.RoomSelect;

export const roomHeaderSelect = {
  id: true,
  name: true,
  createdAt: true,
  endedAt: true,
  teacher: { select: { displayName: true } },
} satisfies Prisma.RoomSelect;

export const teacherRoomListSelect = {
  id: true,
  name: true,
  createdAt: true,
  endedAt: true,
  _count: { select: { enrollments: true } },
} satisfies Prisma.RoomSelect;
