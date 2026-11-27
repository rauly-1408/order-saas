-- Link an order to one of the tenant's own delivery riders.
ALTER TABLE "Order" ADD COLUMN "deliveryRiderId" TEXT;

CREATE INDEX "Order_deliveryRiderId_idx" ON "Order"("deliveryRiderId");

ALTER TABLE "Order"
ADD CONSTRAINT "Order_deliveryRiderId_fkey"
FOREIGN KEY ("deliveryRiderId") REFERENCES "DeliveryRider"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
