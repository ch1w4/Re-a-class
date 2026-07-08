import type { Prisma } from '@prisma/client';
import { surveyOptionsOrderBy } from './surveyOptions';

// userId は自分の回答だけを responses に含めるためのフィルタに使う（他の生徒の回答は返さない）
export const buildStudentRoomDetailSelect = (userId: string) =>
  ({
    id: true,
    name: true,
    createdAt: true,
    endedAt: true,
    teacher: { select: { displayName: true } },
    surveys: {
      include: {
        options: { orderBy: surveyOptionsOrderBy },
        responses: { where: { userId }, select: { id: true, optionId: true } },
      },
      orderBy: { createdAt: 'asc' },
    },
  }) satisfies Prisma.RoomSelect;

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
