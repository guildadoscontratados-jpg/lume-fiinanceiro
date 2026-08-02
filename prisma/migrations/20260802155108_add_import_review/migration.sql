-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REVIEW',
    "cardId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "ImportBatch_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "sourceLine" INTEGER NOT NULL,
    "rawData" TEXT NOT NULL,
    "occurredAt" DATETIME,
    "description" TEXT,
    "amountCents" INTEGER,
    "installmentNo" INTEGER,
    "installmentTotal" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    "duplicateOfId" TEXT,
    "transactionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_cardId_sourceHash_key" ON "ImportBatch"("cardId", "sourceHash");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_transactionId_key" ON "ImportRow"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_batchId_sourceLine_key" ON "ImportRow"("batchId", "sourceLine");
