import type { Role } from '@prisma/client';

export const PAGE_ROLES = {
  teacher: ['TEACHER'],
  student: ['STUDENT'],
  home: ['TEACHER', 'STUDENT'],
  admin: ['SERVER_ADMIN'],
  schoolAdmin: ['SCHOOL_ADMIN'],
  board: ['STUDENT', 'SCHOOL_ADMIN'],
} as const satisfies Record<string, readonly Role[]>;

export function canAccessPage(role: Role, allowedRoles: readonly Role[]): boolean {
  return allowedRoles.includes(role);
}
