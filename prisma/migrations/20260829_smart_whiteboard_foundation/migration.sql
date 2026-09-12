-- SMART-WB-1A — Smart Whiteboard foundation
--
-- Additive only: three new tables. No ALTER on any existing table, no column
-- added to "live_sessions" (the LiveSession.whiteboard back-relation is a Prisma
-- level relation resolved through the unique "sessionId" below), no backfill,
-- no data movement, no destructive operation.
--
-- Reversible with:
--   DROP TABLE "whiteboard_snapshots";
--   DROP TABLE "whiteboard_pages";
--   DROP TABLE "whiteboard_boards";
--
-- NOT APPLIED to Production by this phase. Apply with `prisma migrate deploy`.

-- One whiteboard per live session; source of truth for whiteboard state lives in
-- "whiteboard_snapshots", not in any realtime channel.
CREATE TABLE "whiteboard_boards" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "activePageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whiteboard_boards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whiteboard_pages" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whiteboard_pages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whiteboard_snapshots" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "elements" JSONB NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whiteboard_snapshots_pkey" PRIMARY KEY ("id")
);

-- Makes "ensure a board for this session" idempotent under concurrent teacher calls.
CREATE UNIQUE INDEX "whiteboard_boards_sessionId_key" ON "whiteboard_boards"("sessionId");
CREATE INDEX "whiteboard_boards_status_idx" ON "whiteboard_boards"("status");

-- Page list is always read ordered by "order" for one board.
CREATE INDEX "whiteboard_pages_boardId_order_idx" ON "whiteboard_pages"("boardId", "order");

-- The real conflict barrier: two writers racing on the same revision collide here
-- (Prisma P2002) instead of silently overwriting each other.
CREATE UNIQUE INDEX "whiteboard_snapshots_pageId_revision_key" ON "whiteboard_snapshots"("pageId", "revision");
CREATE INDEX "whiteboard_snapshots_boardId_createdAt_idx" ON "whiteboard_snapshots"("boardId", "createdAt");

-- Deleting a session removes its whiteboard; deleting a page removes its history.
-- "createdById" is intentionally a plain TEXT column (no FK to "users"), matching
-- "live_session_admissions"."decidedBy" — this phase adds no back-relation on User.
ALTER TABLE "whiteboard_boards" ADD CONSTRAINT "whiteboard_boards_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboard_pages" ADD CONSTRAINT "whiteboard_pages_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "whiteboard_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboard_snapshots" ADD CONSTRAINT "whiteboard_snapshots_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "whiteboard_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboard_snapshots" ADD CONSTRAINT "whiteboard_snapshots_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "whiteboard_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
