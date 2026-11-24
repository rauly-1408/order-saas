-- VeriFactu: certificado digital del restaurante y estado del envío a la AEAT.
CREATE TABLE "VerifactuSender" (
    "tenantId" TEXT NOT NULL,
    "certSealed" TEXT,
    "holderName" TEXT,
    "holderNif" TEXT,
    "notAfter" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3),
    "nextSendAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerifactuSender_pkey" PRIMARY KEY ("tenantId")
);

ALTER TABLE "VerifactuSender" ADD CONSTRAINT "VerifactuSender_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
