-- Alérgenos declarados en cada producto (Carta o importados de otra plataforma).
-- En la carta se suman a los que salen del escandallo.
ALTER TABLE "Product" ADD COLUMN "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[];
