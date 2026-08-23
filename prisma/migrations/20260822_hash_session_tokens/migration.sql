-- تصحيح: توحيد أسماء الجداول مع @@map("sessions") + تفعيل pgcrypto لدالة digest
-- يعيد بناء عمود token بقيم SHA-256 مع الحفاظ على الفهرس الفريد بالاسم الأصلي

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "sessions" ADD COLUMN "tokenHash" TEXT;

UPDATE "sessions" SET "tokenHash" = encode(digest("token", 'sha256'), 'hex');

ALTER TABLE "sessions" ALTER COLUMN "tokenHash" SET NOT NULL;

ALTER TABLE "sessions" DROP COLUMN "token";

ALTER TABLE "sessions" RENAME COLUMN "tokenHash" TO "token";

-- الفهرس الفريد الأصلي (sessions_token_key) سقط مع DROP COLUMN ويُعاد بناؤه هنا
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_key" ON "sessions" ("token");
