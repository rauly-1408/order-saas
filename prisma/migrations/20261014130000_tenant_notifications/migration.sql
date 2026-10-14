-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "dailySummaryEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

