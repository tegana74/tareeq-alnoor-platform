-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_live_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "teacherId" TEXT NOT NULL,
    "courseId" TEXT,
    "startAt" DATETIME NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "url" TEXT,
    "price" DECIMAL NOT NULL DEFAULT 0,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "maxCapacity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "live_sessions_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "live_sessions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_live_sessions" ("createdAt", "description", "durationMinutes", "id", "maxCapacity", "price", "startAt", "teacherId", "title", "url") SELECT "createdAt", "description", "durationMinutes", "id", "maxCapacity", "price", "startAt", "teacherId", "title", "url" FROM "live_sessions";
DROP TABLE "live_sessions";
ALTER TABLE "new_live_sessions" RENAME TO "live_sessions";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
