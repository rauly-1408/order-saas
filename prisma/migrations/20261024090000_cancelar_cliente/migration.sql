-- CreateEnum
CREATE TYPE "CancelledBy" AS ENUM ('RESTAURANT', 'CUSTOMER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CancelReason" AS ENUM ('MISTAKE', 'ADDRESS_TIME', 'CHANGED_MIND');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelReason" "CancelReason",
ADD COLUMN     "cancelledBy" "CancelledBy";

