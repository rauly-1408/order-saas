-- Pago mixto: parte en efectivo y el resto con datáfono o Bizum.
ALTER TABLE "Order" ADD COLUMN "cashPartCents" INTEGER NOT NULL DEFAULT 0;
