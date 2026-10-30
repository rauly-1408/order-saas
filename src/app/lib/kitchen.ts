import { prisma } from "@/app/lib/prisma";
import { accessOf, defaultStationCategories } from "@/app/lib/roles";
import { modifierLabels } from "@/app/lib/menuOptions";
import { tableLabel } from "@/app/lib/tables";

// Pantalla de cocina (KDS): las comandas pendientes de preparar, de la tienda
// online, la Caja y las rondas de las mesas, en tarjetas. Cocina y barra ven
// solo las líneas de sus secciones de la carta (lo libre va a cocina); el
// gerente, encargado y caja eligen la vista. Ver docs/PANTALLA-COCINA.md

export type KitchenView = "COCINA" | "BARRA" | "TODO";
export type KitchenLine = { id: string; quantity: number; name: string; modifiers: string[]; note: string | null };
export type KitchenTicket = {
  key: string; // «order:<id>» o «round:<orderId>:<ronda>»
  kind: "order" | "round";
  orderId: string;
  round: number | null;
  title: string; // «Mesa 4 · Ronda 2» o «#118»
  subtitle: string; // «Cumpleaños · 4 pax» o «Para llevar · Marta»
  status: string; // pedido: CREATED | ACCEPTED | PREPARING; ronda: OPEN
  createdAt: string;
  lines: KitchenLine[];
};

type Who = { role: string; position?: string | null; stationCategoryIds?: string[] };

// Qué secciones ve esta pantalla: las del puesto, o las de la vista elegida.
async function sectionsFor(tenantId: string, who: Who, view: KitchenView): Promise<{ station: "COCINA" | "BARRA" | null; ids: Set<string> }> {
  const station = accessOf(who).station ?? (view === "TODO" ? null : view);
  if (!station) return { station: null, ids: new Set() };
  if (accessOf(who).station) return { station, ids: new Set(who.stationCategoryIds ?? []) };
  const cats = await prisma.category.findMany({ where: { tenantId }, select: { id: true, name: true } });
  return { station, ids: new Set(defaultStationCategories(station, cats)) };
}

export async function kitchenTickets(tenantId: string, storeId: string | null, who: Who, view: KitchenView): Promise<{ station: "COCINA" | "BARRA" | null; tickets: KitchenTicket[] }> {
  const { station, ids } = await sectionsFor(tenantId, who, view);
  const byStore = storeId ? { storeId } : {};
  const [orders, tables] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId, ...byStore, tableId: null, status: { in: ["CREATED", "ACCEPTED", "PREPARING"] } },
      orderBy: { createdAt: "asc" },
      take: 60,
      select: { id: true, orderNumber: true, status: true, channel: true, dineIn: true, customerName: true, createdAt: true, scheduledFor: true, items: { select: { id: true, productId: true, productName: true, quantity: true, modifiers: true, note: true, readyAt: true } } },
    }),
    prisma.order.findMany({
      where: { tenantId, ...byStore, tableId: { not: null }, status: "OPEN" },
      select: { id: true, customerName: true, guests: true, table: { select: { name: true } }, items: { where: { readyAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, productId: true, productName: true, quantity: true, modifiers: true, note: true, round: true, createdAt: true } } },
    }),
  ]);
  // Sección de cada producto, para repartir entre cocina y barra.
  const productIds = [...new Set([...orders.flatMap((o) => o.items), ...tables.flatMap((o) => o.items)].map((l) => l.productId))];
  const cat = new Map((productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, categoryId: true } }) : []).map((p) => [p.id, p.categoryId]));
  const mine = (productId: string) => (!station ? true : cat.has(productId) ? ids.has(cat.get(productId)!) : station === "COCINA");
  const line = (l: { id: string; quantity: number; productName: string; modifiers: unknown; note: string | null }): KitchenLine => ({ id: l.id, quantity: l.quantity, name: l.productName, modifiers: modifierLabels(l.modifiers), note: l.note });

  const tickets: KitchenTicket[] = [];
  for (const o of orders) {
    const lines = o.items.filter((l) => mine(l.productId)).map(line);
    if (!lines.length) continue;
    const how = o.channel === "DELIVERY" ? "A domicilio" : o.dineIn ? "Comer aquí" : "Para llevar";
    tickets.push({ key: `order:${o.id}`, kind: "order", orderId: o.id, round: null, title: `#${o.orderNumber ?? "?"}`, subtitle: [how, o.customerName].filter(Boolean).join(" · "), status: o.status, createdAt: (o.scheduledFor ?? o.createdAt).toISOString(), lines });
  }
  for (const t of tables) {
    const rounds = new Map<number, typeof t.items>();
    for (const l of t.items) if (mine(l.productId)) rounds.set(l.round, [...(rounds.get(l.round) ?? []), l]);
    const name = t.table?.name ?? "";
    for (const [round, ls] of rounds) {
      tickets.push({
        key: `round:${t.id}:${round}`,
        kind: "round",
        orderId: t.id,
        round,
        title: `Mesa ${name} · Ronda ${round}`,
        subtitle: [tableLabel(t.customerName, name), t.guests ? `${t.guests} pax` : null].filter(Boolean).join(" · "),
        status: "OPEN",
        createdAt: ls[0].createdAt.toISOString(),
        lines: ls.map(line),
      });
    }
  }
  tickets.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { station, tickets };
}

// «Listo» en una ronda de mesa: solo las líneas de esta pantalla (lo de barra
// sigue pendiente para barra). Devuelve cuántas líneas se marcaron.
export async function markRoundReady(tenantId: string, orderId: string, round: number, who: Who, view: KitchenView): Promise<number> {
  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId, status: "OPEN", tableId: { not: null } }, select: { id: true, items: { where: { round, readyAt: null }, select: { id: true, productId: true } } } });
  if (!order) return 0;
  const { station, ids } = await sectionsFor(tenantId, who, view);
  const cat = new Map((await prisma.product.findMany({ where: { id: { in: order.items.map((l) => l.productId) } }, select: { id: true, categoryId: true } })).map((p) => [p.id, p.categoryId]));
  const lineIds = order.items.filter((l) => (!station ? true : cat.has(l.productId) ? ids.has(cat.get(l.productId)!) : station === "COCINA")).map((l) => l.id);
  if (!lineIds.length) return 0;
  const r = await prisma.orderLine.updateMany({ where: { id: { in: lineIds }, readyAt: null }, data: { readyAt: new Date() } });
  return r.count;
}
