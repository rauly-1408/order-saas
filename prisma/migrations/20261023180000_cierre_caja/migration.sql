-- AlterEnum
ALTER TYPE "PrintKind" ADD VALUE 'CLOSING';

-- CreateTable
CREATE TABLE "CashSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedByUserId" TEXT,
    "openedByName" TEXT,
    "openingFloatCents" INTEGER NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "closedByName" TEXT,
    "countedCashCents" INTEGER,
    "expectedCashCents" INTEGER,
    "differenceCents" INTEGER,
    "summary" JSONB,
    "notes" TEXT,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashSession_tenantId_storeId_closedAt_idx" ON "CashSession"("tenantId", "storeId", "closedAt");

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

