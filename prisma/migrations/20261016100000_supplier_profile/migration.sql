-- CreateEnum
CREATE TYPE "SupplierOrderMethod" AS ENUM ('WHATSAPP', 'EMAIL', 'PHONE', 'IN_PERSON');

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "expectedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "deliveryDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "extraEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "leadDays" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "minOrderCents" INTEGER,
ADD COLUMN     "orderCutoff" TEXT,
ADD COLUMN     "orderMethod" "SupplierOrderMethod" NOT NULL DEFAULT 'WHATSAPP',
ADD COLUMN     "whatsapp" TEXT;

