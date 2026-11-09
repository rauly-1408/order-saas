-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "joinedTableIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
