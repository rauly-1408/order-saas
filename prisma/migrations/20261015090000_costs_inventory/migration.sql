-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ORDER', 'ORDER_CANCEL', 'RECEIPT', 'COUNT', 'WASTE');

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "minStock" DOUBLE PRECISION,
ADD COLUMN     "stockQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "trackStock" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ModifierOption" ADD COLUMN     "stockOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "stockOut" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "stockAfter" DOUBLE PRECISION NOT NULL,
    "valueCents" INTEGER NOT NULL,
    "orderId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_createdAt_idx" ON "StockMovement"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_ingredientId_createdAt_idx" ON "StockMovement"("ingredientId", "createdAt");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

