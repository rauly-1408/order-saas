-- CreateTable
CREATE TABLE "CourierAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'NONE',
    "autoRequest" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secrets" TEXT,
    "publicKeyPem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "rawStatus" TEXT,
    "feeCents" INTEGER,
    "trackingUrl" TEXT,
    "courierName" TEXT,
    "courierPhone" TEXT,
    "pickupEta" TIMESTAMP(3),
    "dropoffEta" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourierAccount_tenantId_key" ON "CourierAccount"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CourierDelivery_orderId_key" ON "CourierDelivery"("orderId");

-- CreateIndex
CREATE INDEX "CourierDelivery_provider_externalId_idx" ON "CourierDelivery"("provider", "externalId");

-- CreateIndex
CREATE INDEX "CourierDelivery_tenantId_idx" ON "CourierDelivery"("tenantId");

-- AddForeignKey
ALTER TABLE "CourierAccount" ADD CONSTRAINT "CourierAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierDelivery" ADD CONSTRAINT "CourierDelivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

