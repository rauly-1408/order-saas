import { NextRequest, NextResponse } from "next/server";
import { aiConfigured } from "@/app/lib/anthropic";
import { prisma } from "@/app/lib/prisma";
import { costsTenant } from "@/app/lib/costsApi";
import { netOfVat, recipeCostCents, type CostIngredient } from "@/app/lib/costs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECENT_ORDERS = 30;

// GET: todo lo que necesita la pantalla de Costes (ingredientes, proveedores,
// carta con escandallos) + margen real de los últimos pedidos.
export async function GET(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;

  const [suppliers, ingredients, categories, orders, movements, purchaseOrders, priceChanges, tenantInfo] = await Promise.all([
    prisma.supplier.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.ingredient.findMany({ where: { tenantId }, orderBy: { name: "asc" }, include: { prepLines: { orderBy: { sortOrder: "asc" }, select: { ingredientId: true, quantity: true } } } }),
    prisma.category.findMany({
      where: { tenantId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        products: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            basePriceCents: true,
            isAvailable: true,
            stockOut: true,
            recipeLines: { select: { ingredientId: true, quantity: true } },
            modifierGroups: {
              orderBy: { sortOrder: "asc" },
              select: {
                defaultOptionId: true,
                group: {
                  select: {
                    code: true,
                    name: true,
                    isRequired: true,
                    options: {
                      orderBy: { sortOrder: "asc" },
                      select: {
                        id: true,
                        name: true,
                        priceDeltaCents: true,
                        stockOut: true,
                        recipeLines: { select: { ingredientId: true, quantity: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.order.findMany({
      where: { tenantId, status: { notIn: ["CANCELLED", "AWAITING_PAYMENT"] } },
      orderBy: { createdAt: "desc" },
      take: RECENT_ORDERS,
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        customerName: true,
        totalCents: true,
        feesCents: true,
        applicationFeeCents: true,
        items: { select: { productId: true, productName: true, quantity: true, totalCents: true, modifiers: true } },
      },
    }),
    prisma.stockMovement.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, ingredientId: true, type: true, quantity: true, stockAfter: true, valueCents: true, orderId: true, note: true, createdAt: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { lines: { select: { id: true, ingredientId: true, quantity: true, packPriceCents: true, receivedQuantity: true } } },
    }),
    prisma.ingredientPriceChange.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);

  // ── Margen real de pedidos ─────────────────────────────────────────
  const ingById = new Map<string, CostIngredient>(ingredients.map((i) => [i.id, i]));
  const costOf = (lines: { ingredientId: string; quantity: number }[]) =>
    recipeCostCents(lines.flatMap((l) => (ingById.has(l.ingredientId) ? [{ quantity: l.quantity, ingredient: ingById.get(l.ingredientId)! }] : [])));

  type ProductCost = { cost: number; hasRecipe: boolean; options: Map<string, { cost: number; hasRecipe: boolean }> };
  const productCosts = new Map<string, ProductCost>();
  // Respaldo por nombre: si la carta se recargó, los pedidos antiguos apuntan a
  // IDs de producto que ya no existen, pero conservan el nombre en el snapshot.
  const productCostsByName = new Map<string, ProductCost>();
  for (const cat of categories) {
    for (const p of cat.products) {
      const options = new Map<string, { cost: number; hasRecipe: boolean }>();
      for (const pmg of p.modifierGroups) {
        for (const o of pmg.group.options) {
          options.set(`${pmg.group.code}::${o.name}`, { cost: costOf(o.recipeLines), hasRecipe: o.recipeLines.length > 0 });
        }
      }
      const pc = { cost: costOf(p.recipeLines), hasRecipe: p.recipeLines.length > 0, options };
      productCosts.set(p.id, pc);
      productCostsByName.set(p.name.toLowerCase(), pc);
    }
  }

  const orderMargins = orders.map((o) => {
    let foodCost = 0;
    let complete = true;
    for (const item of o.items) {
      const pc = productCosts.get(item.productId) ?? productCostsByName.get(item.productName.toLowerCase());
      if (!pc || !pc.hasRecipe) complete = false;
      let unit = pc?.cost ?? 0;
      // Las opciones se guardan como snapshot {groupCode, option}: se casan por nombre.
      const mods = Array.isArray(item.modifiers) ? (item.modifiers as Record<string, unknown>[]) : [];
      for (const m of mods) {
        if (typeof m?.groupCode !== "string" || typeof m?.option !== "string") continue;
        const oc = pc?.options.get(`${m.groupCode}::${m.option}`);
        if (!oc?.hasRecipe) complete = false;
        unit += oc?.cost ?? 0;
      }
      foodCost += unit * item.quantity;
    }
    const foodRevenueGross = o.items.reduce((acc, i) => acc + i.totalCents, 0);
    const revenueNet = netOfVat(foodRevenueGross);
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      customerName: o.customerName,
      revenueNetCents: Math.round(revenueNet),
      foodCostCents: Math.round(foodCost),
      platformFeeCents: o.applicationFeeCents,
      marginCents: Math.round(revenueNet - foodCost - o.applicationFeeCents),
      complete,
    };
  });

  return NextResponse.json({
    restaurantName: tenantInfo?.name ?? "",
    aiEnabled: aiConfigured(),
    suppliers,
    ingredients,
    categories,
    orders: orderMargins,
    movements,
    purchaseOrders,
    priceChanges,
  });
}
