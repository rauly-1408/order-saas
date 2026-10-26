-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "perItemCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "perItemQty" DOUBLE PRECISION;
