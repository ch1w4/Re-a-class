import type { Role } from '@prisma/client';

export const PAGE_ROLES = {
  teacher: ['TEACHER'],
  student: ['STUDENT'],
  home: ['TEACHER', 'STUDENT'],
  admin: ['SERVER_ADMIN'],
  schoolAdmin: ['SCHOOL_ADMIN'],
  // 生徒向け匿名掲示板は /student/[roomId] の掲示板タブに統合済み。
  // /board は学校管理者が実名で確認するための専用ページ。
  board: ['SCHOOL_ADMIN'],
} as const satisfies Record<string, readonly Role[]>;

export function canAccessPage(role: Role, allowedRoles: readonly Role[]): boolean {
  return allowedRoles.includes(role);
}
