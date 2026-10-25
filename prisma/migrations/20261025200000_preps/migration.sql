-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'PRODUCTION';

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN "isPrep" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "prepExtras" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "prepNotes" TEXT;

-- CreateTable
CREATE TABLE "PrepLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "prepId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PrepLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrepLine_prepId_idx" ON "PrepLine"("prepId");

-- CreateIndex
CREATE INDEX "PrepLine_ingredientId_idx" ON "PrepLine"("ingredientId");

-- AddForeignKey
ALTER TABLE "PrepLine" ADD CONSTRAINT "PrepLine_prepId_fkey" FOREIGN KEY ("prepId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepLine" ADD CONSTRAINT "PrepLine_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
