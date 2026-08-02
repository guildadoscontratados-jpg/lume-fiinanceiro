-- CreateTable
CREATE TABLE "TransactionShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "percentageBps" INTEGER NOT NULL,
    CONSTRAINT "TransactionShare_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransactionShare_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TransactionShare_transactionId_personId_key" ON "TransactionShare"("transactionId", "personId");
