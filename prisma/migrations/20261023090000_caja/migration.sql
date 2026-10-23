-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('ONLINE', 'COUNTER', 'PHONE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'CASH';
ALTER TYPE "PaymentMethod" ADD VALUE 'CARD_TERMINAL';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cashTenderedCents" INTEGER,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "dineIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'ONLINE';

