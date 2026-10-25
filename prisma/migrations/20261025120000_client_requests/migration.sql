-- CreateTable
CREATE TABLE "ClientRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientRequest_tenantId_createdAt_idx" ON "ClientRequest"("tenantId", "createdAt");
