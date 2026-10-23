-- Mesas: barra, paredes y textos del plano por zona. Ver docs/MESAS.md
-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "floorPlan" JSONB NOT NULL DEFAULT '{}';

