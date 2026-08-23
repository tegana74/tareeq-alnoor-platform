-- AlterTable — idempotent: العمود موجود فعليًا في Production (أُضيف خارج نظام المايجريشنز)
ALTER TABLE "exam_attempts" ADD COLUMN IF NOT EXISTS "isResultPublished" BOOLEAN NOT NULL DEFAULT false;
