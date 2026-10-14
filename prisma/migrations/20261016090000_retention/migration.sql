-- AlterTable
ALTER TABLE "CampaignSend" ADD COLUMN     "convertedAt" TIMESTAMP(3),
ADD COLUMN     "convertedOrderId" TEXT;

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "oncePerCustomer" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "CampaignSend_customerId_status_idx" ON "CampaignSend"("customerId", "status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

