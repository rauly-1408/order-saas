-- Migration: add_missing_fields
-- Adds all fields that exist in schema.prisma but were absent from the initial DB migration.
-- Safe: all new columns are nullable or have defaults. No data loss.

-- ─── Store: add missing operational fields ────────────────
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "phone"     TEXT;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "email"     TEXT;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "whatsapp"  TEXT;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "instagram" TEXT;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "active"    BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "deliveryEnabled"           BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "takeawayEnabled"           BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "minimumOrderCents"         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "deliveryFeeCents"          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "estimatedDeliveryMinutes"  INTEGER NOT NULL DEFAULT 45;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "estimatedPickupMinutes"    INTEGER NOT NULL DEFAULT 20;

-- Rename hours -> openingHours if not already done
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='Store' AND column_name='hours'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='Store' AND column_name='openingHours'
  ) THEN
    ALTER TABLE "Store" RENAME COLUMN "hours" TO "openingHours";
  END IF;
END $$;

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "openingHours"  JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ─── Category: add missing fields ─────────────────────────
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "imageUrl"    TEXT;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "isActive"    BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- slug already exists in init migration
-- isFeatured already exists in init migration

-- ─── Product: add missing fields ──────────────────────────
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isAvailable"  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isFeatured"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "hasModifiers" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sortOrder"    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ─── ModifierOption: add isAvailable ──────────────────────
ALTER TABLE "ModifierOption" ADD COLUMN IF NOT EXISTS "isAvailable" BOOLEAN NOT NULL DEFAULT true;

-- ─── Order: add missing fields ────────────────────────────
-- Rename channel columns to match new schema if needed
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerPostalCode" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "currency"           TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "subtotalCents"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "feesCents"          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ─── OrderLine: rename/add totalCents alias ───────────────
ALTER TABLE "OrderLine" ADD COLUMN IF NOT EXISTS "lineTotalCents" INTEGER NOT NULL DEFAULT 0;

-- Sync lineTotalCents from totalCents where null
UPDATE "OrderLine" SET "lineTotalCents" = "totalCents" WHERE "lineTotalCents" = 0 AND "totalCents" > 0;

-- ─── Tenant: add updatedAt ────────────────────────────────
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ─── User: add updatedAt ──────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
