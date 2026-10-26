-- CreateEnum
CREATE TYPE "IngredientKind" AS ENUM ('FOOD', 'CONSUMABLE');

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'USE';

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "category" TEXT,
ADD COLUMN     "kind" "IngredientKind" NOT NULL DEFAULT 'FOOD',
ADD COLUMN     "perOrderChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "perOrderQty" DOUBLE PRECISION;

