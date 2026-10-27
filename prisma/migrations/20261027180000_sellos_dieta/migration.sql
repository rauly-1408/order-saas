-- Sellos de dieta (Vegano, Vegetariano) en cada producto.
ALTER TABLE "Product" ADD COLUMN "dietTags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Punto de partida: los productos de una categoría «vegana» (p. ej. «Molletes
-- veganos») quedan marcados como veganos y vegetarianos. Se cambia en Carta.
UPDATE "Product" SET "dietTags" = ARRAY['VEGAN', 'VEGETARIAN']
WHERE NOT "isCombo"
  AND "categoryId" IN (SELECT "id" FROM "Category" WHERE lower("name") LIKE '%vegan%');
