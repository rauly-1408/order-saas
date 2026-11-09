-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "tableIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "tableCombos" JSONB NOT NULL DEFAULT '[]';
