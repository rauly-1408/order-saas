-- Pantalla de cocina: cuándo se marcó lista una línea de una ronda de mesa.
ALTER TABLE "OrderLine" ADD COLUMN "readyAt" TIMESTAMP(3);
