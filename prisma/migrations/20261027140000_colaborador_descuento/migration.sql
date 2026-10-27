-- AlterTable
ALTER TABLE "Collaborator" ADD COLUMN     "discountPct" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "collaboratorDiscountCents" INTEGER NOT NULL DEFAULT 0;
