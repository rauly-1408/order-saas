-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "pausedUntil" TIMESTAMP(3),
ADD COLUMN     "prepExtraMinutes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "StoreClosure" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreClosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "postalCodes" TEXT[],
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "minOrderCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreClosure_storeId_endsAt_idx" ON "StoreClosure"("storeId", "endsAt");

-- AddForeignKey
ALTER TABLE "StoreClosure" ADD CONSTRAINT "StoreClosure_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Datos: el panel (Configuración) guardaba envío, mínimo, canales y tiempos en
-- Tenant.settings, pero los pedidos se calculaban con las columnas de Store.
-- Desde aquí Store es la referencia: se copian los valores del panel.
UPDATE "Store" s SET
  "deliveryEnabled"          = COALESCE((t.settings->>'deliveryEnabled')::boolean, s."deliveryEnabled"),
  "takeawayEnabled"          = COALESCE((t.settings->>'takeawayEnabled')::boolean, s."takeawayEnabled"),
  "deliveryFeeCents"         = COALESCE((t.settings->>'deliveryFeeCents')::int, s."deliveryFeeCents"),
  "minimumOrderCents"        = COALESCE((t.settings->>'minimumOrderCents')::int, s."minimumOrderCents"),
  "estimatedDeliveryMinutes" = COALESCE((t.settings->>'estimatedDeliveryMinutes')::int, s."estimatedDeliveryMinutes"),
  "estimatedPickupMinutes"   = COALESCE((t.settings->>'estimatedPickupMinutes')::int, s."estimatedPickupMinutes")
FROM "Tenant" t
WHERE t.id = s."tenantId";
