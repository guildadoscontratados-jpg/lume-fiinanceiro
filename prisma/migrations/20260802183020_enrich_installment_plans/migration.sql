/*
  Warnings:

  - Added the required column `cardId` to the `InstallmentPlan` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Installment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "dueMonth" DATETIME NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROJECTED',
    "transactionId" TEXT,
    CONSTRAINT "Installment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstallmentPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Installment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Installment" ("amountCents", "dueMonth", "id", "planId", "sequence", "status", "transactionId") SELECT "amountCents", "dueMonth", "id", "planId", "sequence", "status", "transactionId" FROM "Installment";
DROP TABLE "Installment";
ALTER TABLE "new_Installment" RENAME TO "Installment";
CREATE UNIQUE INDEX "Installment_transactionId_key" ON "Installment"("transactionId");
CREATE UNIQUE INDEX "Installment_planId_sequence_key" ON "Installment"("planId", "sequence");
CREATE TABLE "new_InstallmentPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "installmentCents" INTEGER NOT NULL,
    "totalInstallments" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "cardId" TEXT NOT NULL,
    "merchantNormalized" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InstallmentPlan_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InstallmentPlan" ("createdAt", "description", "endDate", "id", "installmentCents", "startDate", "totalCents", "totalInstallments", "updatedAt") SELECT "createdAt", "description", "endDate", "id", "installmentCents", "startDate", "totalCents", "totalInstallments", "updatedAt" FROM "InstallmentPlan";
DROP TABLE "InstallmentPlan";
ALTER TABLE "new_InstallmentPlan" RENAME TO "InstallmentPlan";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
