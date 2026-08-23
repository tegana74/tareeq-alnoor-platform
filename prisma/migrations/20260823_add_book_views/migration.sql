-- إضافة تخزين إكمال الكتب (نمط VideoView) — PHASE 6B-3B
CREATE TABLE "book_views" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "book_views_userId_bookId_key" ON "book_views"("userId", "bookId");
CREATE INDEX "book_views_bookId_idx" ON "book_views"("bookId");

ALTER TABLE "book_views" ADD CONSTRAINT "book_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "book_views" ADD CONSTRAINT "book_views_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
