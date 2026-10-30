import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessArea, getSessionFromRequest } from "@/app/lib/auth";
import { storeForSession } from "@/app/lib/stores";
import { MOVE_REASONS, openSession, sessionFigures } from "@/app/lib/cashSession";
import { enqueueClosing, enqueuePartialClosing } from "@/app/lib/printing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cierre de caja del local. Ver docs/CAJA.md
//   GET  → sesión abierta (o null) y, con «Ve lo recaudado», cifras y cierres anteriores
//   POST { action: "open", floatCents }
//        { action: "move", kind: "IN" | "OUT", amountCents, reason }
//        { action: "close", countedCents, notes? }
// Cualquier usuario del restaurante abre, mueve y cierra. Quien no tiene «Ve lo
// recaudado» cuenta a ciegas: no ve lo esperado ni la diferencia.

const MAX_CENTS = 10_000_000; // 100.000 €

async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const session = await getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return { error: NextResponse.json({ error: "Prohibido" }, { status: 403 }) };
  const noArea = denyUnlessArea(session, "caja");
  if (noArea) return { error: noArea };
  const storeId = await storeForSession(tenant.id, session.storeId, new URL(req.url).searchParams.get("store"));
  if (!storeId) return { error: NextResponse.json({ error: session.storeId ? "Tu local no está activo. Habla con el gerente." : "No hay ningún local activo" }, { status: 400 }) };
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { name: true, email: true } });
  return { tenant, session, storeId, userName: user?.name || user?.email || null };
}

async function payload(tenantId: string, storeId: string, seesTakings: boolean) {
  const open = await openSession(tenantId, storeId);
  const figures = open && seesTakings ? await sessionFigures(open) : null;
  const history = seesTakings
    ? await prisma.cashSession.findMany({
        where: { tenantId, storeId, closedAt: { not: null } },
        orderBy: { closedAt: "desc" },
        take: 14,
        select: { id: true, openedAt: true, closedAt: true, openedByName: true, closedByName: true, openingFloatCents: true, countedCashCents: true, expectedCashCents: true, differenceCents: true, summary: true, notes: true },
      })
    : [];
  return {
    seesTakings,
    open: open && {
      id: open.id,
      openedAt: open.openedAt,
      openedByName: open.openedByName,
      openingFloatCents: open.openingFloatCents,
      movements: open.movements.map((m) => ({ id: m.id, kind: m.kind, amountCents: m.amountCents, reason: m.reason, userName: m.userName, createdAt: m.createdAt })),
    },
    figures,
    history,
    reasons: MOVE_REASONS,
  };
}

export async function GET(req: NextRequest) {
  try {
    const c = await ctx(req);
    if ("error" in c) return c.error;
    return NextResponse.json(await payload(c.tenant.id, c.storeId, Boolean(c.session.seesTakings)));
  } catch (err) {
    console.error("[GET /api/admin/caja/sesion]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

const cents = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_CENTS ? (v as number) : null);

export async function POST(req: NextRequest) {
  try {
    const c = await ctx(req);
    if ("error" in c) return c.error;
    const { tenant, storeId, userName, session } = c;
    const sees = Boolean(session.seesTakings);
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const current = await openSession(tenant.id, storeId);

    if (b.action === "open") {
      if (current) return NextResponse.json({ error: "La caja ya está abierta" }, { status: 400 });
      const float = cents(b.floatCents);
      if (float == null) return NextResponse.json({ error: "Escribe el efectivo con el que abres (puede ser 0)" }, { status: 400 });
      const opened = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"caja:" + storeId}))`;
        if (await tx.cashSession.findFirst({ where: { tenantId: tenant.id, storeId, closedAt: null }, select: { id: true } })) return false;
        await tx.cashSession.create({ data: { tenantId: tenant.id, storeId, openingFloatCents: float, openedByUserId: session.userId, openedByName: userName } });
        return true;
      });
      if (!opened) return NextResponse.json({ error: "La caja ya está abierta" }, { status: 400 });
      return NextResponse.json(await payload(tenant.id, storeId, sees));
    }

    if (!current) return NextResponse.json({ error: "La caja está cerrada. Ábrela primero." }, { status: 400 });

    if (b.action === "move") {
      const amount = cents(b.amountCents);
      if (!amount) return NextResponse.json({ error: "Escribe un importe" }, { status: 400 });
      const kind = b.kind === "IN" ? "IN" : b.kind === "OUT" ? "OUT" : null;
      if (!kind) return NextResponse.json({ error: "Elige si entra o sale dinero" }, { status: 400 });
      const reason = (typeof b.reason === "string" && b.reason.trim().slice(0, 80)) || "Otro";
      await prisma.cashMovement.create({ data: { sessionId: current.id, kind, amountCents: amount, reason, userName } });
      return NextResponse.json(await payload(tenant.id, storeId, sees));
    }

    // Cierre parcial (informe X): cifras hasta ahora en la impresora, sin cerrar.
    if (b.action === "partial") {
      if (!sees) return NextResponse.json({ error: "Para ver las cifras hace falta el permiso «Ve lo recaudado»" }, { status: 403 });
      const fig = await sessionFigures(current, new Date());
      const printed = await enqueuePartialClosing(current, fig, userName);
      return NextResponse.json({ printed });
    }

    if (b.action === "close") {
      const counted = cents(b.countedCents);
      if (counted == null) return NextResponse.json({ error: "Escribe el efectivo que has contado en el cajón" }, { status: 400 });
      const closedAt = new Date();
      const fig = await sessionFigures(current, closedAt);
      const difference = counted - fig.expectedCashCents;
      const notes = typeof b.notes === "string" && b.notes.trim() ? b.notes.trim().slice(0, 300) : null;
      const done = await prisma.cashSession.updateMany({
        where: { id: current.id, closedAt: null },
        data: {
          closedAt,
          closedByUserId: session.userId,
          closedByName: userName,
          countedCashCents: counted,
          expectedCashCents: fig.expectedCashCents,
          differenceCents: difference,
          notes,
          summary: { orders: fig.orders, byPayment: fig.byPayment, totalCents: fig.totalCents, inCents: fig.inCents, outCents: fig.outCents } as unknown as Prisma.InputJsonValue,
        },
      });
      if (done.count === 0) return NextResponse.json({ error: "Esta caja ya se ha cerrado" }, { status: 400 });
      const closed = { id: current.id };
      // Informe de cierre impreso (con cifras): solo si quien cierra ve lo
      // recaudado; quien cuenta a ciegas no recibe las cifras en papel.
      if (sees) await enqueueClosing(closed.id).catch((e) => console.error("[cierre] imprimir", e));
      return NextResponse.json({
        ...(await payload(tenant.id, storeId, sees)),
        closed: sees ? { id: closed.id, countedCashCents: counted, expectedCashCents: fig.expectedCashCents, differenceCents: difference, figures: fig } : { id: closed.id, countedCashCents: counted },
      });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/admin/caja/sesion]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
