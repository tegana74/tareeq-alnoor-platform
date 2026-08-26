-- LIVE-9B — Student Admission & Waiting Room
-- Additive only: one new table. No ALTER on existing tables, no backfill,
-- no destructive operation. Reversible with DROP TABLE "live_session_admissions".

CREATE TABLE "live_session_admissions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,

    CONSTRAINT "live_session_admissions_pkey" PRIMARY KEY ("id")
);

-- One admission row per (session, student) → makes the request endpoint idempotent
CREATE UNIQUE INDEX "live_session_admissions_sessionId_userId_key" ON "live_session_admissions"("sessionId", "userId");

-- Teacher panel query: pending requests for a session
CREATE INDEX "live_session_admissions_sessionId_status_idx" ON "live_session_admissions"("sessionId", "status");

ALTER TABLE "live_session_admissions" ADD CONSTRAINT "live_session_admissions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_session_admissions" ADD CONSTRAINT "live_session_admissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
