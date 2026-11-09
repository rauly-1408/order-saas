import { NextRequest, NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";
import { accessOf, canManageTenant } from "@/app/lib/roles";
import { listStores, storeForSession } from "@/app/lib/stores";
import { cleanText } from "@/app/lib/text";
import { MAX_TABLES_PER_STORE, TableError, addRound, openTable, tableLabel, tableNames } from "@/app/lib/tables";
import { once, requestIdOf } from "@/app/lib/idempotency";
import { prepareRound, type RoundInput } from "@/app/lib/tableRound";
import { enqueueTablePrint } from "@/app/lib/printing";
import { runTableAction, type TableActionBody } from "@/app/lib/tableActions";
import { readCombos } from "@/app/lib/tableCombos";
import { addDays, localParts, startOfDayIn, tenantTimeZone } from "@/app/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mesas: el mapa del local (GET), abrir una mesa (POST open, cualquier usuario)
// y crear, cambiar o quitar mesas (POST add/update/remove, solo el gerente).
// Ver docs/MESAS.md

async function context(req: NextRequest) {
  const slug = new URL(req.url).pathname.split("/").at(-2) ?? "";
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, settings: true, addons: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const session = await getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return { error: NextResponse.json({ error: "Prohibido" }, { status: 403 }) };
  if (!accessOf(session).mesas) return { error: NextResponse.json({ error: "Tu puesto no tiene acceso a Mesas" }, { status: 403 }) };
  return { tenant, session };
}

// Elementos fijos del plano: barra, pared o texto, en % del plano de su zona.
type Fixture = { id: string; kind: "BAR" | "WALL" | "LABEL"; x: number; y: number; w: number; h: number; label: string };
const KINDS = ["BAR", "WALL", "LABEL"] as const;
const pct = (v: unknown, min: number, max: number, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v * 10) / 10)) : dflt);
function cleanFixtures(raw: unknown): Fixture[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 40).flatMap((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const kind = KINDS.find((k) => k === o.kind);
    if (!kind) return [];
    return [{
      id: typeof o.id === "string" && /^[\w-]{1,40}$/.test(o.id) ? o.id : `f${Date.now()}${i}`,
      kind,
      x: pct(o.x, 0, 99, 10),
      y: pct(o.y, 0, 99, 10),
      w: pct(o.w, 1, 100, 20),
      h: pct(o.h, 1, 100, 8),
      label: cleanText(o.label, 30),
    }];
  });
}
// Zonas del local, en su orden. Se guardan en Store.floorPlan bajo ZONES_KEY
// para que una zona vacía (una terraza aún sin mesas) siga a la vista. Un local
// que nunca las ha tocado empieza con Interior y Terraza.
const ZONES_KEY = "__zones";
const BASE_ZONES = ["Interior", "Terraza"];
const MAX_ZONES = 12;
function readZones(raw: unknown, tableZones: string[]): string[] {
  const saved = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>)[ZONES_KEY] : undefined;
  // Sin lista guardada: las zonas de sus mesas (Interior y Terraza delante) y una Terraza de base.
  const rank = (z: string) => { const i = BASE_ZONES.indexOf(z); return i < 0 ? BASE_ZONES.length : i; };
  const list = Array.isArray(saved) ? saved.flatMap((z) => (typeof z === "string" && cleanText(z, 30) ? [cleanText(z, 30)] : [])) : tableZones.length ? [...tableZones, "Terraza"].sort((a, b) => rank(a) - rank(b)) : BASE_ZONES;
  const seen = new Set<string>();
  return [...list, ...tableZones].filter((z) => (seen.has(z.toLowerCase()) ? false : (seen.add(z.toLowerCase()), true))).slice(0, MAX_ZONES);
}
const withZones = (plan: Record<string, Fixture[]>, zones: string[]) => ({ ...plan, [ZONES_KEY]: zones });

function readFixtures(raw: unknown): Record<string, Fixture[]> {
  const out: Record<string, Fixture[]> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [zone, items] of Object.entries(raw as Record<string, unknown>).filter(([k]) => k !== ZONES_KEY).slice(0, 20)) {
    const list = cleanFixtures(items);
    if (list.length) out[zone.slice(0, 30)] = list;
  }
  return out;
}

const nameOf = (u: { name: string | null; email: string } | undefined) => (u ? u.name?.trim() || u.email.split("@")[0] : null);

export async function GET(req: NextRequest) {
  try {
    const ctx = await context(req);
    if ("error" in ctx) return ctx.error;
    const { tenant, session } = ctx;
    const storeId = await storeForSession(tenant.id, session.storeId, new URL(req.url).searchParams.get("store"));
    const stores = session.storeId ? [] : (await listStores(tenant.id, { activeOnly: true })).map((s) => ({ id: s.id, name: s.name }));
    if (!storeId) return NextResponse.json({ stores, storeId: null, canManage: canManageTenant(session.role), canCharge: accessOf(session).cobrar, sees: Boolean(session.seesTakings), tables: [], fixtures: {}, zones: [], combos: [] });

    // En paralelo: el plano se refresca cada pocos segundos en todos los móviles de sala.
    // Reservas de hoy que aún no han llegado: la mesa lo muestra en el plano.
    const tz = tenantTimeZone(tenant.settings);
    const endOfDay = startOfDayIn(tz, addDays(localParts(new Date(), tz).ymd, 1));
    const [store, tables, open, booked] = await Promise.all([
      prisma.store.findUnique({ where: { id: storeId }, select: { floorPlan: true, tableCombos: true } }),
      prisma.diningTable.findMany({ where: { tenantId: tenant.id, storeId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
      prisma.order.findMany({
        where: { tenantId: tenant.id, storeId, status: "OPEN", tableId: { not: null } },
        select: { id: true, orderNumber: true, tableId: true, guests: true, totalCents: true, createdAt: true, billRequestedAt: true, createdByUserId: true, customerName: true },
      }),
      prisma.reservation.findMany({
        where: { storeId, status: { in: ["PENDING", "CONFIRMED"] }, startsAt: { gte: new Date(Date.now() - 60 * 60_000), lt: endOfDay }, NOT: { tableIds: { isEmpty: true } } },
        orderBy: { startsAt: "asc" },
        select: { id: true, startsAt: true, name: true, guests: true, status: true, tableIds: true },
      }),
    ]);
    const nextBooking = new Map<string, { id: string; at: string; name: string; guests: number; pending: boolean }>();
    for (const r of booked) for (const id of r.tableIds) if (!nextBooking.has(id)) nextBooking.set(id, { id: r.id, at: r.startsAt.toISOString(), name: r.name, guests: r.guests, pending: r.status === "PENDING" });
    const userIds = [...new Set(open.flatMap((o) => (o.createdByUserId ? [o.createdByUserId] : [])))];
    const orderIds = open.map((o) => o.id);
    const [userRows, lineStats] = await Promise.all([
      userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
      orderIds.length ? prisma.orderLine.groupBy({ by: ["orderId"], where: { orderId: { in: orderIds } }, _sum: { quantity: true }, _max: { round: true, createdAt: true } }) : Promise.resolve([]),
    ]);
    const users = new Map(userRows.map((u) => [u.id, u]));
    const stats = new Map(lineStats.map((l) => [l.orderId, l]));
    const byTable = new Map(open.map((o) => [o.tableId, o]));
    return NextResponse.json({
      stores,
      storeId,
      canManage: canManageTenant(session.role),
      canCharge: accessOf(session).cobrar,
      sees: Boolean(session.seesTakings),
      fixtures: readFixtures(store?.floorPlan),
      zones: readZones(store?.floorPlan, [...new Set(tables.map((t) => t.zone))]),
      combos: readCombos(store?.tableCombos, new Set(tables.map((t) => t.id))),
      tables: tables.map((t) => {
        const o = byTable.get(t.id);
        return {
          id: t.id,
          name: t.name,
          zone: t.zone,
          seats: t.seats,
          shape: t.shape,
          posX: t.posX,
          posY: t.posY,
          reservation: nextBooking.get(t.id) ?? null,
          open: o
            ? {
                orderId: o.id,
                orderNumber: o.orderNumber,
                label: tableLabel(o.customerName, t.name),
                guests: o.guests,
                totalCents: o.totalCents,
                openedAt: o.createdAt,
                billRequested: Boolean(o.billRequestedAt),
                waiter: nameOf(o.createdByUserId ? users.get(o.createdByUserId) : undefined),
                lines: stats.get(o.id)?._sum.quantity ?? 0,
                rounds: stats.get(o.id)?._max.round ?? 0,
                lastRoundAt: stats.get(o.id)?._max.createdAt ?? null,
              }
            : null,
        };
      }),
    });
  } catch (err) {
    console.error("[GET /api/admin/mesas]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

type Body = {
  action?: "open" | "table" | "add" | "update" | "remove" | "layout" | "fixtures" | "zones" | "combos";
  combos?: unknown[]; // action "combos": la lista entera
  zoneOp?: "add" | "rename" | "remove"; // action "zones"
  newZone?: string; // zoneOp "rename"
  op?: TableActionBody["action"]; // action "table": lo que se hace en la mesa
  toTableId?: string; // op "move"
  method?: string;
  cashTenderedCents?: number;
  units?: TableActionBody["units"];
  items?: unknown[];
  shape?: string;
  positions?: { id?: unknown; posX?: unknown; posY?: unknown }[];
  tableId?: string;
  guests?: number;
  storeId?: string;
  zone?: string;
  prefix?: string;
  from?: number;
  to?: number;
  seats?: number;
  name?: string;
  round?: RoundInput; // abrir y enviar la primera ronda a la vez (mesa abierta sin conexión)
  requestId?: string;
};

export async function POST(req: NextRequest) {
  try {
    const ctx = await context(req);
    if ("error" in ctx) return ctx.error;
    const { tenant, session } = ctx;
    const b = ((await req.json().catch(() => null)) ?? {}) as Body;

    // Lo guardado sin conexión en una mesa abierta sin conexión (aún sin número
    // de cuenta): se hace en la cuenta que esa mesa tenga abierta al llegar.
    if (b.action === "table") {
      if (typeof b.tableId !== "string") return NextResponse.json({ error: "Mesa no válida" }, { status: 400 });
      if (!["round", "bill", "pay", "move"].includes(b.op ?? "")) return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
      const order = await prisma.order.findFirst({
        where: { tableId: b.tableId, tenantId: tenant.id, status: "OPEN" },
        select: { id: true, tableId: true, orderNumber: true, storeId: true, table: { select: { name: true } } },
      });
      if (!order) {
        const t = await prisma.diningTable.findUnique({ where: { id: b.tableId }, select: { name: true } });
        return NextResponse.json({ error: `${t ? `La mesa ${t.name}` : "Esa mesa"} ya no está abierta: se cobró o se cerró desde otro aparato` }, { status: 409 });
      }
      if (session.storeId && session.storeId !== order.storeId) return NextResponse.json({ error: "Esa mesa es de otro local" }, { status: 403 });
      const { op, toTableId, ...rest } = b;
      return await runTableAction({ tenant, session, order }, { ...(rest as TableActionBody), action: op, tableId: op === "move" ? toTableId : undefined });
    }

    if (b.action === "open") {
      if (typeof b.tableId !== "string") return NextResponse.json({ error: "Mesa no válida" }, { status: 400 });
      const table = await prisma.diningTable.findUnique({ where: { id: b.tableId }, select: { storeId: true, tenantId: true } });
      if (!table || table.tenantId !== tenant.id) return NextResponse.json({ error: "Mesa no encontrada" }, { status: 404 });
      if (session.storeId && session.storeId !== table.storeId) return NextResponse.json({ error: "Esa mesa es de otro local" }, { status: 403 });
      const currency = ((tenant.settings as Record<string, unknown>)?.currency as string) ?? "EUR";
      const round = b.round;
      if (!round) {
        const order = await openTable(tenant.id, b.tableId, Number(b.guests) || 1, session.userId, currency);
        return NextResponse.json({ orderId: order.id, orderNumber: order.orderNumber });
      }
      const tableId = b.tableId;
      return await once(tenant.id, requestIdOf(b.requestId), async () => {
        const prepared = await prepareRound(tenant.id, round, accessOf(session).anular); // bajar el precio: gerente o encargado
        if ("error" in prepared) return NextResponse.json({ error: prepared.error }, { status: 400 });
        // Si otro camarero la abrió mientras no había conexión, la ronda se suma a esa cuenta.
        const openOrder = () => prisma.order.findFirst({ where: { tableId, status: "OPEN" }, select: { id: true, orderNumber: true } });
        let order = await openOrder();
        if (!order) {
          try {
            order = await openTable(tenant.id, tableId, Number(b.guests) || 1, session.userId, currency);
          } catch (err) {
            if (!(err instanceof TableError)) throw err;
            order = await openOrder();
            if (!order) throw err;
          }
        }
        const r = await addRound(tenant.id, order.id, prepared.lines, tenant.addons.includes("COSTS") ? prepared.consumption : [], session.userId, tenant.addons.includes("COSTS") ? prepared.takeaway : []);
        const orderId = order.id;
        after(() => enqueueTablePrint(orderId, { kind: "ROUND", round: r.round }));
        return NextResponse.json({ orderId, orderNumber: order.orderNumber, round: r.round });
      });
    }

    // Configurar las mesas: solo quien gestiona el restaurante.
    if (!canManageTenant(session.role)) return NextResponse.json({ error: "Las mesas las configura el gerente" }, { status: 403 });
    const seats = Math.max(1, Math.min(Math.floor(Number(b.seats) || 4), 50));
    const zone = cleanText(b.zone, 30) || "Sala";
    const shape = b.shape === "ROUND" ? "ROUND" : "SQUARE";

    // Plano: la barra, paredes y textos de una zona (se guarda la zona entera).
    if (b.action === "fixtures") {
      const storeId = await storeForSession(tenant.id, session.storeId, b.storeId);
      if (!storeId) return NextResponse.json({ error: "No hay ningún local activo" }, { status: 400 });
      const store = await prisma.store.findUnique({ where: { id: storeId }, select: { floorPlan: true } });
      const plan = readFixtures(store?.floorPlan);
      const items = cleanFixtures(b.items);
      if (items.length) plan[zone] = items;
      else delete plan[zone];
      const zones = readZones(store?.floorPlan, [...new Set((await prisma.diningTable.findMany({ where: { storeId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { zone: true } })).map((t) => t.zone))]);
      await prisma.store.update({ where: { id: storeId }, data: { floorPlan: withZones(plan, zones) } });
      return NextResponse.json({ ok: true, fixtures: plan });
    }

    // Combinaciones de mesas para reservas: se guarda la lista entera.
    if (b.action === "combos") {
      const storeId = await storeForSession(tenant.id, session.storeId, b.storeId);
      if (!storeId) return NextResponse.json({ error: "No hay ningún local activo" }, { status: 400 });
      const ids = new Set((await prisma.diningTable.findMany({ where: { storeId, isActive: true }, select: { id: true } })).map((t) => t.id));
      const combos = readCombos(b.combos, ids);
      await prisma.store.update({ where: { id: storeId }, data: { tableCombos: combos } });
      return NextResponse.json({ ok: true, combos });
    }

    // Zonas del local: añadir, cambiar el nombre (sus mesas y su plano la siguen) o quitar una vacía.
    if (b.action === "zones") {
      const storeId = await storeForSession(tenant.id, session.storeId, b.storeId);
      if (!storeId) return NextResponse.json({ error: "No hay ningún local activo" }, { status: 400 });
      const store = await prisma.store.findUnique({ where: { id: storeId }, select: { floorPlan: true } });
      const active = await prisma.diningTable.findMany({ where: { storeId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { zone: true } });
      let zones = readZones(store?.floorPlan, [...new Set(active.map((t) => t.zone))]);
      const plan = readFixtures(store?.floorPlan);
      const name = cleanText(b.zone, 30);
      const has = (z: string) => zones.find((x) => x.toLowerCase() === z.toLowerCase());
      if (!name) return NextResponse.json({ error: "Escribe el nombre de la zona" }, { status: 400 });
      if (b.zoneOp === "add") {
        if (has(name)) return NextResponse.json({ error: `Ya hay una zona «${has(name)}»` }, { status: 400 });
        if (zones.length >= MAX_ZONES) return NextResponse.json({ error: `Como mucho ${MAX_ZONES} zonas por local` }, { status: 400 });
        zones = [...zones, name];
      } else if (b.zoneOp === "rename") {
        const to = cleanText(b.newZone, 30);
        const from = has(name);
        if (!from) return NextResponse.json({ error: "Esa zona ya no existe" }, { status: 404 });
        if (!to) return NextResponse.json({ error: "Escribe el nombre nuevo" }, { status: 400 });
        if (to.toLowerCase() !== from.toLowerCase() && has(to)) return NextResponse.json({ error: `Ya hay una zona «${has(to)}»` }, { status: 400 });
        await prisma.diningTable.updateMany({ where: { storeId, zone: from }, data: { zone: to } });
        if (plan[from]) { plan[to] = plan[from]; if (to !== from) delete plan[from]; }
        zones = zones.map((z) => (z === from ? to : z));
      } else if (b.zoneOp === "remove") {
        const from = has(name);
        if (!from) return NextResponse.json({ error: "Esa zona ya no existe" }, { status: 404 });
        const n = active.filter((t) => t.zone === from).length;
        if (n) return NextResponse.json({ error: `La zona ${from} tiene ${n} ${n === 1 ? "mesa" : "mesas"}: quítalas o pásalas a otra zona antes` }, { status: 400 });
        if (zones.length <= 1) return NextResponse.json({ error: "El local necesita al menos una zona" }, { status: 400 });
        delete plan[from];
        zones = zones.filter((z) => z !== from);
      } else return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
      await prisma.store.update({ where: { id: storeId }, data: { floorPlan: withZones(plan, zones) } });
      return NextResponse.json({ ok: true, zones });
    }

    // Plano: guardar dónde está cada mesa (en % del plano de su zona).
    if (b.action === "layout") {
      const pct = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v * 10) / 10)) : null);
      const list = Array.isArray(b.positions) ? b.positions.slice(0, MAX_TABLES_PER_STORE) : [];
      const ids = list.flatMap((p) => (typeof p?.id === "string" ? [p.id] : []));
      const mine = new Set((await prisma.diningTable.findMany({ where: { id: { in: ids }, tenantId: tenant.id }, select: { id: true } })).map((t) => t.id));
      await prisma.$transaction(list.filter((p) => typeof p?.id === "string" && mine.has(p.id as string)).map((p) => prisma.diningTable.update({ where: { id: p.id as string }, data: { posX: pct(p.posX), posY: pct(p.posY) } })));
      return NextResponse.json({ ok: true });
    }

    if (b.action === "add") {
      const storeId = await storeForSession(tenant.id, session.storeId, b.storeId);
      if (!storeId) return NextResponse.json({ error: "No hay ningún local activo" }, { status: 400 });
      const names = tableNames(cleanText(b.prefix, 12), Number(b.from) || 1, Number(b.to) || 1);
      if (!names.length) return NextResponse.json({ error: "Indica cuántas mesas crear" }, { status: 400 });
      const existing = await prisma.diningTable.findMany({ where: { storeId }, select: { name: true, isActive: true, sortOrder: true } });
      if (existing.filter((t) => t.isActive).length + names.length > MAX_TABLES_PER_STORE) return NextResponse.json({ error: `Como mucho ${MAX_TABLES_PER_STORE} mesas por local` }, { status: 400 });
      const taken = new Map(existing.map((t) => [t.name.toLowerCase(), t]));
      let sort = existing.reduce((a, t) => Math.max(a, t.sortOrder), 0);
      let created = 0;
      for (const name of names) {
        const prev = taken.get(name.toLowerCase());
        if (prev?.isActive) continue; // ya existe: no se duplica
        if (prev) await prisma.diningTable.update({ where: { storeId_name: { storeId, name } }, data: { isActive: true, zone, seats, shape, posX: null, posY: null, sortOrder: ++sort } });
        else await prisma.diningTable.create({ data: { tenantId: tenant.id, storeId, name, zone, seats, shape, sortOrder: ++sort } });
        created++;
      }
      return NextResponse.json({ created, skipped: names.length - created });
    }

    if (typeof b.tableId !== "string") return NextResponse.json({ error: "Mesa no válida" }, { status: 400 });
    const table = await prisma.diningTable.findUnique({ where: { id: b.tableId } });
    if (!table || table.tenantId !== tenant.id) return NextResponse.json({ error: "Mesa no encontrada" }, { status: 404 });

    if (b.action === "update") {
      const name = cleanText(b.name, 20);
      if (!name) return NextResponse.json({ error: "Escribe el nombre de la mesa" }, { status: 400 });
      try {
        await prisma.diningTable.update({ where: { id: table.id }, data: { name, zone, seats, shape, ...(zone !== table.zone && { posX: null, posY: null }) } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return NextResponse.json({ error: `Ya hay una mesa «${name}» en este local` }, { status: 400 });
        throw err;
      }
      return NextResponse.json({ ok: true });
    }

    if (b.action === "remove") {
      const open = await prisma.order.count({ where: { tableId: table.id, status: "OPEN" } });
      if (open) return NextResponse.json({ error: `La mesa ${table.name} tiene una cuenta abierta` }, { status: 400 });
      // Con historial se desactiva (las cuentas antiguas la siguen nombrando).
      const used = await prisma.order.count({ where: { tableId: table.id } });
      if (used) await prisma.diningTable.update({ where: { id: table.id }, data: { isActive: false } });
      else await prisma.diningTable.delete({ where: { id: table.id } });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (err) {
    if (err instanceof TableError) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof Error && err.message.startsWith("Transicion")) return NextResponse.json({ error: "Esta mesa acaba de cambiar. Vuelve a abrirla." }, { status: 409 });
    console.error("[POST /api/admin/mesas]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
