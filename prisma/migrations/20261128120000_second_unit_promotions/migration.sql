-- Promociones con descuento en cada segunda unidad de productos seleccionados.
ALTER TYPE "PromotionKind" ADD VALUE 'SECOND_UNIT_PERCENT';
ALTER TABLE "Promotion" ADD COLUMN "productIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
