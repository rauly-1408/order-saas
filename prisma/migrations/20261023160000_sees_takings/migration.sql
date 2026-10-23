-- AlterTable
ALTER TABLE "User" ADD COLUMN     "seesTakings" BOOLEAN NOT NULL DEFAULT false;

-- Solo el administrador principal (el gerente más antiguo de cada restaurante) ve lo recaudado.
UPDATE "User" u SET "seesTakings" = true
WHERE u.role = 'TENANT_ADMIN'
  AND u.id = (SELECT id FROM "User" WHERE "tenantId" = u."tenantId" AND role = 'TENANT_ADMIN' ORDER BY "createdAt" ASC LIMIT 1);
UPDATE "User" SET "seesTakings" = true WHERE role = 'SUPERADMIN';
