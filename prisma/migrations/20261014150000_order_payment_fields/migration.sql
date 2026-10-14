-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('IN_STORE', 'CARD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "applicationFeeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'IN_STORE',
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "stripePaymentIntentId" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "platformFeeBps" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripePaymentIntentId_key" ON "Order"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_stripeAccountId_key" ON "Tenant"("stripeAccountId");

