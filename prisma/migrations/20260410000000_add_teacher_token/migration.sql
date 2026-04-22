ALTER TABLE "Room" ADD COLUMN "teacherToken" TEXT NOT NULL DEFAULT '';
UPDATE "Room" SET "teacherToken" = replace(gen_random_uuid()::text, '-', '') WHERE "teacherToken" = '';
