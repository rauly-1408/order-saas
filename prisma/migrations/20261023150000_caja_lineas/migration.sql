-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "note" TEXT;

