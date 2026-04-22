-- 理解度チェック集計結果テキストカラムを追加
ALTER TABLE "UnderstandingCheck" ADD COLUMN IF NOT EXISTS "resultBody" TEXT NOT NULL DEFAULT '';
