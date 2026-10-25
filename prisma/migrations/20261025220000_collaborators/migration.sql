-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "collaboratorId" TEXT,
ADD COLUMN     "commissionCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Collaborator" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "place" TEXT,
    "phone" TEXT,
    "code" TEXT NOT NULL,
    "commissionPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Collaborator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollaboratorPayout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "CollaboratorPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collaborator_token_key" ON "Collaborator"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Collaborator_tenantId_code_key" ON "Collaborator"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CollaboratorPayout_collaboratorId_month_key" ON "CollaboratorPayout"("collaboratorId", "month");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "Collaborator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaboratorPayout" ADD CONSTRAINT "CollaboratorPayout_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "Collaborator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

