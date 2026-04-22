-- チャット機能削除マイグレーション
-- ChatMessage テーブルと Room.chatEnabled カラムを削除する

DROP TABLE IF EXISTS "ChatMessage";

ALTER TABLE "Room" DROP COLUMN IF EXISTS "chatEnabled";
