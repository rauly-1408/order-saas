-- Precio distinto en la tienda online (vacío = el del local).
ALTER TABLE "Product" ADD COLUMN "onlinePriceCents" INTEGER;
