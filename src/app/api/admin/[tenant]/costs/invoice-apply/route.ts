import { NextRequest, NextResponse } from "next/server";
import type { BaseUnit } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { costsTenant } from "@/app/lib/costsApi";
import { normalizeAllergens } from "@/app/lib/costs";
import { applyStockDeltas } from "@/app/lib/inventory";
import { recordPriceChange } from "@/app/lib/purchasing";
import { sanitizeInvoiceRecord } from "@/app/lib/invoice";
import { recalcPreps } from "@/app/lib/preps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_UNITS: BaseUnit[] = ["KG", "G", "L", "ML", "UNIT"];

type NewIngredient = { name: string; baseUnit: BaseUnit; packSize: number; packPriceCents: number; allergens: string[] };
type Line = { ingredientId: string | null; newIngredient: NewIngredient | null; quantity: number; packPriceCents: number | null };

// POST { supplierId?, newSupplierName?, documentNumber?,
//        lines: [{ ingredientId?, newIngredient?, quantity, packPriceCents? }],
//        invoice?: { supplierName, supplierTaxId, number, date, baseCents, vatCents, totalCents, vatBreakdown, lines } }
// Aplica un albarán ya revisado: da de alta los ingredientes nuevos (y el
// proveedor si no existía), entrada de stock (RECEIPT) y, si cambió el precio
// de un formato, actualiza el ingrediente y lo deja en el historial. Con
// `invoice`, guarda además la factura tal cual (unidades, IVA y total) como
// gasto; la misma factura (proveedor + nº) no se aplica dos veces.
export async function POST(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(b.lines) ? b.lines : [];
  const lines: Line[] = [];
  for (const r of raw) {
    const l = (r ?? {}) as Record<string, unknown>;
    const quantity = Number(l.quantity);
    const price = l.packPriceCents == null || l.packPriceCents === "" ? null : Number(l.packPriceCents);
    if (!(quantity >= 0) || (price != null && !(Number.isInteger(price) && price >= 0))) {
      return NextResponse.json({ error: "Cantidad o precio no válido" }, { status: 400 });
    }
    const ingredientId = typeof l.ingredientId === "string" && l.ingredientId ? l.ingredientId : null;
    const n = (l.newIngredient ?? null) as Record<string, unknown> | null;
    let newIngredient: NewIngredient | null = null;
    if (!ingredientId) {
      const name = typeof n?.name === "string" ? n.name.trim().slice(0, 80) : "";
      const baseUnit = typeof n?.baseUnit === "string" && BASE_UNITS.includes(n.baseUnit as BaseUnit) ? (n!.baseUnit as BaseUnit) : null;
      const packSize = Number(n?.packSize);
      const packPriceCents = Number(n?.packPriceCents);
      if (!name || !baseUnit || !(packSize > 0) || !(Number.isInteger(packPriceCents) && packPriceCents >= 0)) {
        return NextResponse.json({ error: `Ingrediente nuevo incompleto: nombre, unidad, formato y precio son obligatorios` }, { status: 400 });
      }
      newIngredient = { name, baseUnit, packSize, packPriceCents, allergens: normalizeAllergens(Array.isArray(n?.allergens) ? n!.allergens.map(String) : []) };
    }
    lines.push({ ingredientId, newIngredient, quantity, packPriceCents: price });
  }
  const invoice = sanitizeInvoiceRecord(b.invoice, typeof b.newSupplierName === "string" ? b.newSupplierName : null);
  if (!lines.length && !invoice) return NextResponse.json({ error: "No hay líneas que aplicar" }, { status: 400 });
  if (invoice?.number) {
    const dup = await prisma.supplierInvoice.findFirst({
      where: {
        tenantId,
        number: invoice.number,
        OR: [{ supplierName: { equals: invoice.supplierName, mode: "insensitive" } }, ...(typeof b.supplierId === "string" && b.supplierId ? [{ supplierId: b.supplierId }] : [])],
      },
      select: { createdAt: true },
    });
    if (dup) {
      return NextResponse.json({ error: `Esta factura ya se registró el ${dup.createdAt.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}. No se ha aplicado otra vez para no duplicar el stock.` }, { status: 409 });
    }
  }

  const existingIds = [...new Set(lines.flatMap((l) => (l.ingredientId ? [l.ingredientId] : [])))];
  const ingredients = await prisma.ingredient.findMany({
    where: { tenantId, id: { in: existingIds } },
    select: { id: true, packSize: true, packPriceCents: true },
  });
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  if (byId.size !== existingIds.length) {
    return NextResponse.json({ error: "Algún ingrediente no existe" }, { status: 400 });
  }

  // Proveedor: el elegido o uno nuevo con el nombre que leyó la IA.
  let supplier =
    typeof b.supplierId === "string" && b.supplierId ? await prisma.supplier.findFirst({ where: { id: b.supplierId, tenantId }, select: { id: true, name: true } }) : null;
  const newSupplierName = typeof b.newSupplierName === "string" ? b.newSupplierName.trim().slice(0, 80) : "";
  let supplierCreated = false;
  if (!supplier && newSupplierName) {
    const found = await prisma.supplier.findFirst({ where: { tenantId, name: newSupplierName }, select: { id: true, name: true } });
    supplier = found ?? (await prisma.supplier.create({ data: { tenantId, name: newSupplierName }, select: { id: true, name: true } }));
    supplierCreated = !found;
  }
  const docNumber = typeof b.documentNumber === "string" && b.documentNumber.trim() ? b.documentNumber.trim().slice(0, 60) : null;
  const note = ["Albarán", docNumber && `nº ${docNumber}`, supplier && `de ${supplier.name}`].filter(Boolean).join(" ");

  let priceChanges = 0;
  let created = 0;
  await prisma.$transaction(async (tx) => {
    // 1) Ingredientes nuevos: si ya existe uno con ese nombre, se usa ese.
    for (const l of lines) {
      if (!l.newIngredient) continue;
      const n = l.newIngredient;
      const found = await tx.ingredient.findFirst({ where: { tenantId, name: n.name }, select: { id: true, packSize: true, packPriceCents: true } });
      if (found) {
        l.ingredientId = found.id;
        byId.set(found.id, found);
        if (l.packPriceCents == null) l.packPriceCents = n.packPriceCents;
        continue;
      }
      const ing = await tx.ingredient.create({
        data: { tenantId, name: n.name, baseUnit: n.baseUnit, packSize: n.packSize, packPriceCents: n.packPriceCents, allergens: n.allergens, supplierId: supplier?.id ?? null, trackStock: true },
        select: { id: true, packSize: true, packPriceCents: true },
      });
      created++;
      l.ingredientId = ing.id;
      byId.set(ing.id, ing);
      l.packPriceCents = null; // el precio ya es el del alta: no hay cambio que registrar
    }

    // 2) Stock y precios.
    const deltas = new Map<string, number>();
    const updatedPrice = new Set<string>();
    for (const l of lines) {
      const id = l.ingredientId!;
      if (l.quantity > 0) deltas.set(id, (deltas.get(id) ?? 0) + l.quantity);
      const ing = byId.get(id)!;
      // Un mismo ingrediente en dos líneas: vale el primer precio distinto.
      if (l.packPriceCents != null && l.packPriceCents !== ing.packPriceCents && !updatedPrice.has(ing.id)) {
        updatedPrice.add(ing.id);
        await tx.ingredient.update({ where: { id: ing.id }, data: { packPriceCents: l.packPriceCents } });
        await recordPriceChange(tx, tenantId, ing.id, ing, { packSize: ing.packSize, packPriceCents: l.packPriceCents }, "RECEIPT");
        priceChanges++;
      }
    }
    if (deltas.size) {
      await tx.ingredient.updateMany({ where: { id: { in: [...deltas.keys()] }, tenantId }, data: { trackStock: true } });
      await applyStockDeltas(tx, tenantId, deltas, "RECEIPT", { note });
    }

    // 3) La factura, tal cual, como gasto (con su IVA).
    if (invoice) {
      await tx.supplierInvoice.create({
        data: {
          tenantId,
          supplierId: supplier?.id ?? null,
          supplierName: supplier?.name ?? invoice.supplierName,
          supplierTaxId: invoice.supplierTaxId,
          number: invoice.number ?? docNumber,
          date: invoice.date,
          baseCents: invoice.baseCents,
          vatCents: invoice.vatCents,
          totalCents: invoice.totalCents,
          expenseCents: invoice.expenseCents,
          vatBreakdown: invoice.vatBreakdown,
          lines: invoice.lines,
        },
      });
    }
  });

  if (priceChanges) await recalcPreps(prisma, tenantId);
  return NextResponse.json({ ok: true, invoiceSaved: !!invoice, totalCents: invoice?.totalCents ?? null, vatCents: invoice?.vatCents ?? null, stockLines: lines.filter((l) => l.quantity > 0).length, priceChanges, created, supplierCreated });
}
