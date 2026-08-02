-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REVIEW',
    "mappingRequired" BOOLEAN NOT NULL DEFAULT false,
    "cardId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "ImportBatch_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ImportBatch" ("cardId", "confirmedAt", "createdAt", "fileName", "format", "id", "sourceHash", "status") SELECT "cardId", "confirmedAt", "createdAt", "fileName", "format", "id", "sourceHash", "status" FROM "ImportBatch";
DROP TABLE "ImportBatch";
ALTER TABLE "new_ImportBatch" RENAME TO "ImportBatch";
CREATE UNIQUE INDEX "ImportBatch_cardId_sourceHash_key" ON "ImportBatch"("cardId", "sourceHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
