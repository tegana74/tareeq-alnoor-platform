-- CreateTable
CREATE TABLE "store_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "pointsCost" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'days',
    "value" INTEGER NOT NULL DEFAULT 30,
    "icon" TEXT DEFAULT '🎁',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
