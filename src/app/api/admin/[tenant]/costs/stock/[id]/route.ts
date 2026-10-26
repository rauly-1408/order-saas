import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant, lastSegment } from "@/app/lib/costsApi";
import { refreshStockOuts } from "@/app/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH: configuración de inventario de un ingrediente (control de stock, mínimo
// y stock normal, hasta donde se repone al pedir).
export async function PATCH(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;
  const id = lastSegment(req);

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const data: { trackStock?: boolean; minStock?: number | null; parStock?: number | null } = {};
  if (b.trackStock !== undefined) {
    if (typeof b.trackStock !== "boolean") return NextResponse.json({ error: "Valor no válido" }, { status: 400 });
    data.trackStock = b.trackStock;
  }
  if (b.minStock !== undefined) {
    const min = b.minStock === null || b.minStock === "" ? null : Number(b.minStock);
    if (min !== null && !(min >= 0)) return NextResponse.json({ error: "Mínimo no válido" }, { status: 400 });
    data.minStock = min;
  }
  if (b.parStock !== undefined) {
    const par = b.parStock === null || b.parStock === "" ? null : Number(b.parStock);
    if (par !== null && !(par >= 0)) return NextResponse.json({ error: "Stock normal no válido" }, { status: 400 });
    data.parStock = par;
  }

  const found = await prisma.ingredient.count({ where: { id, tenantId } });
  if (!found) return NextResponse.json({ error: "Ingrediente no encontrado" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.ingredient.update({ where: { id }, data });
    // Activar/desactivar el control cambia qué platos cuentan como agotados.
    if (data.trackStock !== undefined) await refreshStockOuts(tx, tenantId, [id]);
  });
  return NextResponse.json({ ok: true });
}
