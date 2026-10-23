-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "chainIndex" INTEGER NOT NULL,
    "invoiceType" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "numSerie" TEXT NOT NULL,
    "issueDate" TEXT NOT NULL,
    "genTimestamp" TEXT NOT NULL,
    "issuerNif" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL,
    "taxRate" INTEGER NOT NULL,
    "baseCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "rectifiedInvoiceId" TEXT,
    "prevHash" TEXT,
    "hash" TEXT NOT NULL,
    "qrUrl" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "aeatStatus" TEXT NOT NULL DEFAULT 'PENDIENTE_ENVIO',
    "aeatResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_tenantId_createdAt_idx" ON "Invoice"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_chainIndex_key" ON "Invoice"("tenantId", "chainIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_numSerie_key" ON "Invoice"("tenantId", "numSerie");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_invoiceType_key" ON "Invoice"("orderId", "invoiceType");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

