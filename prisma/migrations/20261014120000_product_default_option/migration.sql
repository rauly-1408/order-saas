-- AlterTable
ALTER TABLE "ProductModifierGroup" ADD COLUMN     "defaultOptionId" TEXT;

-- AddForeignKey
ALTER TABLE "ProductModifierGroup" ADD CONSTRAINT "ProductModifierGroup_defaultOptionId_fkey" FOREIGN KEY ("defaultOptionId") REFERENCES "ModifierOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

