import type { Role } from '@prisma/client';
import { prisma } from './prisma';

export interface RoomActor {
  id: string;
  schoolId: string;
  role: Role;
}

export interface RoomScope {
  id: string;
  schoolId: string;
  teacherId: string;
  endedAt: Date | null;
  enrolled: boolean;
}

export function isRoomOwner(actor: RoomActor, room: RoomScope): boolean {
  return actor.role === 'TEACHER' && room.teacherId === actor.id && room.schoolId === actor.schoolId;
}

export function isEnrolledStudent(actor: RoomActor, room: RoomScope): boolean {
  return actor.role === 'STUDENT' && room.schoolId === actor.schoolId && room.enrolled;
}

export function isSchoolRoomAdmin(actor: RoomActor, room: RoomScope): boolean {
  return actor.role === 'SCHOOL_ADMIN' && room.schoolId === actor.schoolId;
}

export async function getRoomScope(roomId: string, userId: string): Promise<RoomScope | null> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      schoolId: true,
      teacherId: true,
      endedAt: true,
      enrollments: {
        where: { userId },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!room) return null;

  return {
    id: room.id,
    schoolId: room.schoolId,
    teacherId: room.teacherId,
    endedAt: room.endedAt,
    enrolled: room.enrollments.length > 0,
  };
}
