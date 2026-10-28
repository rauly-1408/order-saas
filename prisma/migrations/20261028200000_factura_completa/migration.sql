-- Factura completa a nombre del cliente (F1, o F3 si sustituye a la simplificada).
-- Columnas nuevas y opcionales: no toca los registros existentes, que siguen inalterables.
ALTER TABLE "Invoice" ADD COLUMN "substitutedInvoiceId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "recipientNif" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "recipientName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "recipientAddress" TEXT;
