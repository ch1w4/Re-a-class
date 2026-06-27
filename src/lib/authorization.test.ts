import { describe, expect, it } from 'vitest';
import type { Role } from '@prisma/client';
import { canAccessPage, PAGE_ROLES } from './pageAuthorization';
import {
  isEnrolledStudent,
  isRoomOwner,
  isSchoolRoomAdmin,
  type RoomActor,
  type RoomScope,
} from './roomAuthorization';
import { roomHeaderSelect, studentRoomDetailSelect, teacherRoomListSelect } from './roomProjections';

const actors: Record<string, RoomActor> = {
  owner: { id: 'teacher-1', schoolId: 'school-a', role: 'TEACHER' },
  otherTeacher: { id: 'teacher-2', schoolId: 'school-a', role: 'TEACHER' },
  movedTeacher: { id: 'teacher-1', schoolId: 'school-b', role: 'TEACHER' },
  student: { id: 'student-1', schoolId: 'school-a', role: 'STUDENT' },
  otherSchoolStudent: { id: 'student-2', schoolId: 'school-b', role: 'STUDENT' },
  schoolAdmin: { id: 'admin-1', schoolId: 'school-a', role: 'SCHOOL_ADMIN' },
  otherSchoolAdmin: { id: 'admin-2', schoolId: 'school-b', role: 'SCHOOL_ADMIN' },
  serverAdmin: { id: 'server-admin', schoolId: 'system', role: 'SERVER_ADMIN' },
};

function room(enrolled = false): RoomScope {
  return {
    id: 'room-1',
    schoolId: 'school-a',
    teacherId: 'teacher-1',
    endedAt: null,
    enrolled,
  };
}

describe('ページ認可', () => {
  const expectations: Record<Role, string[]> = {
    TEACHER: ['teacher', 'home'],
    STUDENT: ['student', 'home', 'board'],
    SCHOOL_ADMIN: ['schoolAdmin', 'board'],
    SERVER_ADMIN: ['admin'],
  };

  for (const [role, allowedPages] of Object.entries(expectations) as [Role, string[]][]) {
    it(`${role} は定義されたページだけにアクセスできる`, () => {
      for (const [page, allowedRoles] of Object.entries(PAGE_ROLES)) {
        expect(canAccessPage(role, allowedRoles), page).toBe(allowedPages.includes(page));
      }
    });
  }
});

describe('ルーム認可', () => {
  it('所有教師だけが教師操作を行える', () => {
    expect(isRoomOwner(actors.owner, room())).toBe(true);
    expect(isRoomOwner(actors.otherTeacher, room())).toBe(false);
    expect(isRoomOwner(actors.movedTeacher, room())).toBe(false);
    expect(isRoomOwner(actors.student, room(true))).toBe(false);
    expect(isRoomOwner(actors.schoolAdmin, room())).toBe(false);
    expect(isRoomOwner(actors.serverAdmin, room())).toBe(false);
  });

  it('同一学校の参加済み生徒だけが生徒操作を行える', () => {
    expect(isEnrolledStudent(actors.student, room(true))).toBe(true);
    expect(isEnrolledStudent(actors.student, room(false))).toBe(false);
    expect(isEnrolledStudent(actors.otherSchoolStudent, room(true))).toBe(false);
    expect(isEnrolledStudent(actors.owner, room(true))).toBe(false);
  });

  it('同一学校の学校管理者だけが掲示板を管理できる', () => {
    expect(isSchoolRoomAdmin(actors.schoolAdmin, room())).toBe(true);
    expect(isSchoolRoomAdmin(actors.otherSchoolAdmin, room())).toBe(false);
    expect(isSchoolRoomAdmin(actors.serverAdmin, room())).toBe(false);
    expect(isSchoolRoomAdmin(actors.owner, room())).toBe(false);
  });
});

describe('ルームレスポンス', () => {
  const privateFields = [
    'schoolId',
    'teacherId',
    'notes',
    'transcript',
    'summary',
    'reactions',
    'enrollments',
    'understandingCheck',
  ];

  it('生徒向け詳細に教師専用情報を含めない', () => {
    for (const field of privateFields) {
      expect(studentRoomDetailSelect).not.toHaveProperty(field);
    }
    expect(studentRoomDetailSelect).toHaveProperty('surveys');
    expect(studentRoomDetailSelect).toHaveProperty('teacher');
  });

  it('管理者向けヘッダー情報に授業内容を含めない', () => {
    for (const field of [...privateFields, 'surveys']) {
      expect(roomHeaderSelect).not.toHaveProperty(field);
    }
  });

  it('教師向け一覧も必要最小限の項目だけを選択する', () => {
    for (const field of privateFields) {
      expect(teacherRoomListSelect).not.toHaveProperty(field);
    }
    expect(teacherRoomListSelect).toHaveProperty('_count');
  });
});
