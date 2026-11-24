-- Cierres de turno (informe X) dentro de la caja del día.
CREATE TABLE "CashShift" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "startedByName" TEXT,
    "closedByUserId" TEXT,
    "closedByName" TEXT,
    "openingCashCents" INTEGER NOT NULL,
    "expectedCashCents" INTEGER NOT NULL,
    "countedCashCents" INTEGER NOT NULL,
    "differenceCents" INTEGER NOT NULL,
    "summary" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashShift_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashShift_sessionId_number_idx" ON "CashShift"("sessionId", "number");

ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Caja prestada a un camarero (la da el encargado o el gerente).
ALTER TABLE "User" ADD COLUMN "cajaUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "cajaCloseDay" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "cajaGrantedBy" TEXT;
