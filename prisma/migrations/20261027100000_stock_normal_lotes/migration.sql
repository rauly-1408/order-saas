-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "parStock" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "batchFactor" DOUBLE PRECISION;
