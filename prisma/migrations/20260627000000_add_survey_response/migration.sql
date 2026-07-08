-- CreateTable
CREATE TABLE "SurveyResponse" (
  "id" TEXT NOT NULL,
  "surveyId" TEXT NOT NULL,
  "optionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SurveyResponse_surveyId_userId_key" ON "SurveyResponse"("surveyId", "userId");

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "SurveyOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
