ALTER TABLE "DeliveryRider"
ADD COLUMN "accessCodeHash" TEXT,
ADD COLUMN "accessCodeIssuedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "DeliveryRider_accessCodeHash_key"
ON "DeliveryRider"("accessCodeHash");
