-- Mesas: posición en el plano y forma (mesa o taburete). Ver docs/MESAS.md
-- CreateEnum
CREATE TYPE "TableShape" AS ENUM ('SQUARE', 'ROUND');

-- AlterTable
ALTER TABLE "DiningTable" ADD COLUMN     "posX" DOUBLE PRECISION,
ADD COLUMN     "posY" DOUBLE PRECISION,
ADD COLUMN     "shape" "TableShape" NOT NULL DEFAULT 'SQUARE';

