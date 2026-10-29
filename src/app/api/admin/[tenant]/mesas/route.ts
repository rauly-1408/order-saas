import { NextRequest, NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";
import { accessOf, canManageTenant } from "@/app/lib/roles";
import { listStores, storeForSession } from "@/app/lib/stores";
import { cleanText } from "@/app/lib/text";
import { MAX_TABLES_PER_STORE, TableError, addRound, openTable, tableNames } from "@/app/lib/tables";
import { once, requestIdOf } from "@/app/lib/idempotency";
import { prepareRound, type RoundInput } from "@/app/lib/tableRound";
import { enqueueTablePrint } from "@/app/lib/printing";
import { runTableAction, type TableActionBody } from "@/app/lib/tableActions";

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
function readFixtures(raw: unknown): Record<string, Fixture[]> {
  const out: Record<string, Fixture[]> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [zone, items] of Object.entries(raw as Record<string, unknown>).slice(0, 20)) {
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
    if (!storeId) return NextResponse.json({ stores, storeId: null, canManage: canManageTenant(session.role), canCharge: accessOf(session).cobrar, sees: Boolean(session.seesTakings), tables: [], fixtures: {} });

    // En paralelo: el plano se refresca cada pocos segundos en todos los móviles de sala.
    const [store, tables, open] = await Promise.all([
      prisma.store.findUnique({ where: { id: storeId }, select: { floorPlan: true } }),
      prisma.diningTable.findMany({ where: { tenantId: tenant.id, storeId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
      prisma.order.findMany({
        where: { tenantId: tenant.id, storeId, status: "OPEN", tableId: { not: null } },
        select: { id: true, orderNumber: true, tableId: true, guests: true, totalCents: true, createdAt: true, billRequestedAt: true, createdByUserId: true },
      }),
    ]);
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
          open: o
            ? {
                orderId: o.id,
                orderNumber: o.orderNumber,
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
  action?: "open" | "table" | "add" | "update" | "remove" | "layout" | "fixtures";
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
        const prepared = await prepareRound(tenant.id, round, canManageTenant(session.role));
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
      await prisma.store.update({ where: { id: storeId }, data: { floorPlan: plan } });
      return NextResponse.json({ ok: true, fixtures: plan });
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
