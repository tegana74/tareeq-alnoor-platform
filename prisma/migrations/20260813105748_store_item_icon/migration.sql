-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_store_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "pointsCost" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'days',
    "value" INTEGER NOT NULL DEFAULT 30,
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_store_items" ("createdAt", "description", "icon", "id", "isActive", "kind", "pointsCost", "title", "value") SELECT "createdAt", "description", "icon", "id", "isActive", "kind", "pointsCost", "title", "value" FROM "store_items";
DROP TABLE "store_items";
ALTER TABLE "new_store_items" RENAME TO "store_items";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
