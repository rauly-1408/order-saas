import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant } from "@/app/lib/costsApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  productId?: unknown;
  modifierOptionId?: unknown;
  lines?: unknown;
};

// PUT: reemplaza el escandallo completo de un producto O de una opción.
export async function PUT(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;

  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  const productId = typeof body.productId === "string" ? body.productId : null;
  const modifierOptionId = typeof body.modifierOptionId === "string" ? body.modifierOptionId : null;
  if (!productId === !modifierOptionId) {
    return NextResponse.json({ error: "Indica un producto o una opción" }, { status: 400 });
  }
  if (!Array.isArray(body.lines)) return NextResponse.json({ error: "Faltan las líneas" }, { status: 400 });

  const lines: { ingredientId: string; quantity: number }[] = [];
  for (const raw of body.lines) {
    const l = (raw ?? {}) as Record<string, unknown>;
    const quantity = Number(l.quantity);
    if (typeof l.ingredientId !== "string" || !(quantity > 0)) {
      return NextResponse.json({ error: "Cada línea necesita ingrediente y cantidad mayor que 0" }, { status: 400 });
    }
    lines.push({ ingredientId: l.ingredientId, quantity });
  }

  // El destino y los ingredientes deben ser de este restaurante.
  const targetOk = productId
    ? await prisma.product.count({ where: { id: productId, tenantId } })
    : await prisma.modifierOption.count({ where: { id: modifierOptionId!, group: { tenantId } } });
  if (!targetOk) return NextResponse.json({ error: "Producto u opción no encontrado" }, { status: 404 });

  const ingredientIds = [...new Set(lines.map((l) => l.ingredientId))];
  const found = await prisma.ingredient.count({ where: { tenantId, id: { in: ingredientIds } } });
  if (found !== ingredientIds.length) return NextResponse.json({ error: "Algún ingrediente no existe" }, { status: 400 });

  const where = productId ? { tenantId, productId } : { tenantId, modifierOptionId: modifierOptionId! };
  await prisma.$transaction([
    prisma.recipeLine.deleteMany({ where }),
    prisma.recipeLine.createMany({
      data: lines.map((l) => ({ tenantId, ingredientId: l.ingredientId, quantity: l.quantity, productId, modifierOptionId })),
    }),
  ]);
  return NextResponse.json({ ok: true, lines: lines.length });
}
