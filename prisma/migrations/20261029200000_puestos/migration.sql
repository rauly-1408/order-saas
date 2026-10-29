-- Puestos del personal (caja, camareros, cocina, barra, encargado): qué ve y qué puede hacer cada uno.
ALTER TABLE "User" ADD COLUMN "position" TEXT;
ALTER TABLE "User" ADD COLUMN "canCharge" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "stationCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
