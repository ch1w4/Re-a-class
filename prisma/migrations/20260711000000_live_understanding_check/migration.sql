CREATE TABLE "LiveUnderstandingCheck" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "LiveUnderstandingCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LiveUnderstandingCheckResponse" (
  "id" TEXT NOT NULL,
  "checkId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "understood" BOOLEAN NOT NULL,
  "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LiveUnderstandingCheckResponse_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LiveUnderstandingCheck_roomId_endedAt_startedAt_idx"
  ON "LiveUnderstandingCheck"("roomId", "endedAt", "startedAt");
CREATE UNIQUE INDEX "LiveUnderstandingCheckResponse_checkId_userId_key"
  ON "LiveUnderstandingCheckResponse"("checkId", "userId");

ALTER TABLE "LiveUnderstandingCheck" ADD CONSTRAINT "LiveUnderstandingCheck_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveUnderstandingCheckResponse" ADD CONSTRAINT "LiveUnderstandingCheckResponse_checkId_fkey"
  FOREIGN KEY ("checkId") REFERENCES "LiveUnderstandingCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveUnderstandingCheckResponse" ADD CONSTRAINT "LiveUnderstandingCheckResponse_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
