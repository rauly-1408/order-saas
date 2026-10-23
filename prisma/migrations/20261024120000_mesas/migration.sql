-- Mesas: mesas por local y zona, cuenta abierta (OPEN) con rondas. Ver docs/MESAS.md
-- AlterEnum
ALTER TYPE "OrderSource" ADD VALUE 'TABLE';

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'OPEN';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "billRequestedAt" TIMESTAMP(3),
ADD COLUMN     "guests" INTEGER,
ADD COLUMN     "tableId" TEXT;

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "addedByUserId" TEXT,
ADD COLUMN     "round" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DiningTable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zone" TEXT NOT NULL DEFAULT 'Sala',
    "seats" INTEGER NOT NULL DEFAULT 4,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiningTable_tenantId_idx" ON "DiningTable"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_storeId_name_key" ON "DiningTable"("storeId", "name");

-- CreateIndex
CREATE INDEX "Order_tableId_status_idx" ON "Order"("tableId", "status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

