-- Drop existing tables
DROP TABLE IF EXISTS "SurveyOption" CASCADE;
DROP TABLE IF EXISTS "Survey" CASCADE;
DROP TABLE IF EXISTS "Reaction" CASCADE;
DROP TABLE IF EXISTS "ChatMessage" CASCADE;
DROP TABLE IF EXISTS "Room" CASCADE;

-- Drop old migration-added columns (if any leftover)
DROP TABLE IF EXISTS "Session" CASCADE;
DROP TABLE IF EXISTS "Enrollment" CASCADE;
DROP TABLE IF EXISTS "BoardPost" CASCADE;
DROP TABLE IF EXISTS "UnderstandingCheckResponse" CASCADE;
DROP TABLE IF EXISTS "UnderstandingCheck" CASCADE;
DROP TABLE IF EXISTS "Notification" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;
DROP TABLE IF EXISTS "School" CASCADE;

-- Drop old enums
DROP TYPE IF EXISTS "Role" CASCADE;
DROP TYPE IF EXISTS "NotificationType" CASCADE;

-- Enums
CREATE TYPE "Role" AS ENUM ('SERVER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT');
CREATE TYPE "NotificationType" AS ENUM ('UNDERSTANDING_CHECK', 'UNDERSTANDING_RESULT');

-- School
CREATE TABLE "School" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "prefix"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "School_prefix_key" ON "School"("prefix");

-- User
CREATE TABLE "User" (
  "id"           TEXT NOT NULL,
  "schoolId"     TEXT NOT NULL,
  "role"         "Role" NOT NULL DEFAULT 'STUDENT',
  "displayName"  TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Session
CREATE TABLE "Session" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- Room
CREATE TABLE "Room" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "schoolId"    TEXT NOT NULL,
  "teacherId"   TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt"     TIMESTAMP(3),
  "chatEnabled" BOOLEAN NOT NULL DEFAULT false,
  "notes"       TEXT NOT NULL DEFAULT '',
  "transcript"  TEXT NOT NULL DEFAULT '',
  "summary"     TEXT NOT NULL DEFAULT '',
  CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- Enrollment
CREATE TABLE "Enrollment" (
  "id"       TEXT NOT NULL,
  "userId"   TEXT NOT NULL,
  "roomId"   TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Enrollment_userId_roomId_key" ON "Enrollment"("userId", "roomId");

-- ChatMessage
CREATE TABLE "ChatMessage" (
  "id"         TEXT NOT NULL,
  "content"    TEXT NOT NULL,
  "rawContent" TEXT NOT NULL DEFAULT '',
  "userId"     TEXT NOT NULL,
  "roomId"     TEXT NOT NULL,
  "timestamp"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- Reaction
CREATE TABLE "Reaction" (
  "id"        TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "roomId"    TEXT NOT NULL,
  CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- Survey
CREATE TABLE "Survey" (
  "id"        TEXT NOT NULL,
  "question"  TEXT NOT NULL,
  "isOpen"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "roomId"    TEXT NOT NULL,
  CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- SurveyOption
CREATE TABLE "SurveyOption" (
  "id"       TEXT NOT NULL,
  "text"     TEXT NOT NULL,
  "votes"    INTEGER NOT NULL DEFAULT 0,
  "surveyId" TEXT NOT NULL,
  CONSTRAINT "SurveyOption_pkey" PRIMARY KEY ("id")
);

-- BoardPost
CREATE TABLE "BoardPost" (
  "id"        TEXT NOT NULL,
  "content"   TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "roomId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BoardPost_pkey" PRIMARY KEY ("id")
);

-- UnderstandingCheck
CREATE TABLE "UnderstandingCheck" (
  "id"          TEXT NOT NULL,
  "roomId"      TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "notifiedAt"  TIMESTAMP(3),
  "tallyAt"     TIMESTAMP(3),
  "talliedAt"   TIMESTAMP(3),
  CONSTRAINT "UnderstandingCheck_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UnderstandingCheck_roomId_key" ON "UnderstandingCheck"("roomId");

-- UnderstandingCheckResponse
CREATE TABLE "UnderstandingCheckResponse" (
  "id"         TEXT NOT NULL,
  "checkId"    TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "score"      INTEGER NOT NULL,
  "comment"    TEXT NOT NULL DEFAULT '',
  "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UnderstandingCheckResponse_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UnderstandingCheckResponse_checkId_userId_key" ON "UnderstandingCheckResponse"("checkId", "userId");

-- Notification
CREATE TABLE "Notification" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "type"      "NotificationType" NOT NULL,
  "title"     TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "link"      TEXT,
  "isRead"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- Foreign Keys
ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SurveyOption" ADD CONSTRAINT "SurveyOption_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardPost" ADD CONSTRAINT "BoardPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BoardPost" ADD CONSTRAINT "BoardPost_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnderstandingCheck" ADD CONSTRAINT "UnderstandingCheck_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnderstandingCheckResponse" ADD CONSTRAINT "UnderstandingCheckResponse_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "UnderstandingCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnderstandingCheckResponse" ADD CONSTRAINT "UnderstandingCheckResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
