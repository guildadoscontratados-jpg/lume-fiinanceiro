-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "personId" TEXT,
    "categoryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InstallmentPlan_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InstallmentPlan_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InstallmentPlan_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InstallmentPlan" ("cardId", "createdAt", "description", "endDate", "id", "installmentCents", "merchantNormalized", "startDate", "totalCents", "totalInstallments", "updatedAt") SELECT "cardId", "createdAt", "description", "endDate", "id", "installmentCents", "merchantNormalized", "startDate", "totalCents", "totalInstallments", "updatedAt" FROM "InstallmentPlan";
DROP TABLE "InstallmentPlan";
ALTER TABLE "new_InstallmentPlan" RENAME TO "InstallmentPlan";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
