-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "giftCardCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "giftCardId" TEXT,
ADD COLUMN     "tipCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "name" TEXT,
ADD COLUMN     "storeId" TEXT;

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "initialCents" INTEGER NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_tenantId_code_key" ON "GiftCard"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

