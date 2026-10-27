import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { comboTenant } from "@/app/lib/combosApi";
import { autoTranslateMenu } from "@/app/lib/menuTranslate";
import { revalidateMenu } from "@/app/lib/menuCache";
import { groupCode, parseGroup, type GroupInput } from "@/app/lib/optionGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Carta → Opciones: grupos (pan, guarnición, extras…), sus opciones con precio
// y a qué productos se aplican. Ver docs/OPCIONES.md

// GET → grupos con sus opciones y productos, y la carta para elegir productos.
export async function GET(req: NextRequest) {
  const ctx = await comboTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;
  const [groups, categories] = await Promise.all([
    prisma.modifierGroup.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, isRequired: true, minSelect: true, maxSelect: true,
        options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, priceDeltaCents: true, isAvailable: true } },
        productModifierGroups: { select: { productId: true } },
      },
    }),
    prisma.category.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, products: { where: { isCombo: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } } },
    }),
  ]);
  return NextResponse.json({
    groups: groups.map(({ productModifierGroups, ...g }) => ({ ...g, productIds: productModifierGroups.map((p) => p.productId) })),
    categories: categories.filter((c) => c.products.length),
  });
}

// Guarda opciones (crea, cambia y borra las quitadas) y sincroniza los productos.
async function save(tenantId: string, groupId: string, input: GroupInput) {
  const products = await prisma.product.findMany({ where: { tenantId, id: { in: input.productIds }, isCombo: false }, select: { id: true } });
  const wanted = new Set(products.map((p) => p.id));
  await prisma.$transaction(async (tx) => {
    const current = await tx.modifierOption.findMany({ where: { groupId }, select: { id: true } });
    const keep = new Set(input.options.map((o) => o.id).filter((id): id is string => !!id && current.some((c) => c.id === id)));
    // Las opciones quitadas se borran (sus líneas de escandallo también); los pedidos ya hechos guardan su copia.
    await tx.modifierOption.deleteMany({ where: { groupId, id: { notIn: [...keep] } } });
    for (const [i, o] of input.options.entries()) {
      const data = { name: o.name, priceDeltaCents: o.priceDeltaCents, isAvailable: o.isAvailable, sortOrder: i };
      if (o.id && keep.has(o.id)) await tx.modifierOption.update({ where: { id: o.id }, data });
      else await tx.modifierOption.create({ data: { ...data, groupId } });
    }
    const linked = await tx.productModifierGroup.findMany({ where: { groupId }, select: { id: true, productId: true } });
    await tx.productModifierGroup.deleteMany({ where: { id: { in: linked.filter((l) => !wanted.has(l.productId)).map((l) => l.id) } } });
    for (const productId of wanted) {
      if (linked.some((l) => l.productId === productId)) continue;
      const order = await tx.productModifierGroup.count({ where: { productId } });
      await tx.productModifierGroup.create({ data: { productId, groupId, sortOrder: order } });
    }
    // «Tiene opciones» al día en los productos tocados.
    const touched = [...new Set([...linked.map((l) => l.productId), ...wanted])];
    for (const id of touched) {
      const n = await tx.productModifierGroup.count({ where: { productId: id } });
      await tx.product.update({ where: { id }, data: { hasModifiers: n > 0 } });
    }
  }, { timeout: 30_000 });
}

function afterChange(tenantId: string) {
  // Carta en inglés: lo nuevo o cambiado se traduce solo, después de responder.
  after(() => autoTranslateMenu(tenantId));
  after(() => revalidateMenu(tenantId));
}

// POST → crear grupo
export async function POST(req: NextRequest) {
  const ctx = await comboTenant(req);
  if ("error" in ctx) return ctx.error;
  const input = parseGroup(await req.json().catch(() => null));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  const tenantId = ctx.tenant.id;
  const taken = new Set((await prisma.modifierGroup.findMany({ where: { tenantId }, select: { code: true } })).map((g) => g.code));
  const group = await prisma.modifierGroup.create({
    data: { tenantId, name: input.name, code: groupCode(input.name, taken), isRequired: input.isRequired, minSelect: input.minSelect, maxSelect: input.maxSelect },
    select: { id: true },
  });
  await save(tenantId, group.id, input);
  afterChange(tenantId);
  return NextResponse.json({ ok: true, id: group.id }, { status: 201 });
}

// PATCH { id, ... } → cambiar grupo, opciones y productos
export async function PATCH(req: NextRequest) {
  const ctx = await comboTenant(req);
  if ("error" in ctx) return ctx.error;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const tenantId = ctx.tenant.id;
  const group = await prisma.modifierGroup.findFirst({ where: { id: String(body?.id ?? ""), tenantId }, select: { id: true } });
  if (!group) return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
  const input = parseGroup(body);
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  await prisma.modifierGroup.update({ where: { id: group.id }, data: { name: input.name, isRequired: input.isRequired, minSelect: input.minSelect, maxSelect: input.maxSelect } });
  await save(tenantId, group.id, input);
  afterChange(tenantId);
  return NextResponse.json({ ok: true });
}

// DELETE ?id= → borrar el grupo (se quita de todos los productos)
export async function DELETE(req: NextRequest) {
  const ctx = await comboTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;
  const group = await prisma.modifierGroup.findFirst({ where: { id: new URL(req.url).searchParams.get("id") ?? "", tenantId }, select: { id: true, productModifierGroups: { select: { productId: true } } } });
  if (!group) return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.productModifierGroup.deleteMany({ where: { groupId: group.id } });
    await tx.modifierOption.deleteMany({ where: { groupId: group.id } });
    await tx.modifierGroup.delete({ where: { id: group.id } });
    for (const { productId } of group.productModifierGroups) {
      const n = await tx.productModifierGroup.count({ where: { productId } });
      await tx.product.update({ where: { id: productId }, data: { hasModifiers: n > 0 } });
    }
  }, { timeout: 30_000 });
  afterChange(tenantId);
  return NextResponse.json({ ok: true });
}
