import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessArea, getSessionFromRequest } from "@/app/lib/auth";
import { storeForSession } from "@/app/lib/stores";
import { MOVE_REASONS, openSession, sessionFigures, shiftFigures, summaryOf } from "@/app/lib/cashSession";
import { enqueueClosing, enqueuePartialClosing, enqueueShift } from "@/app/lib/printing";
import { accessOf } from "@/app/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cierre de caja del local. Ver docs/CAJA.md
//   GET  → sesión abierta (o null) y, con «Ve lo recaudado», cifras y cierres anteriores
//   POST { action: "open", floatCents }
//        { action: "move", kind: "IN" | "OUT", amountCents, reason }
//        { action: "shift", countedCents, notes? }   cerrar turno (X): cualquiera con Caja
//        { action: "close", countedCents, notes? }   cerrar el día (Z): encargado o gerente
//        { action: "reprint", sessionId, detailed? } volver a imprimir un Z (resumen o detallado)
//        { action: "reprintShift", shiftId }        volver a imprimir un X
// Si el cajón no cuadra, la nota es obligatoria (X y Z). Quien no tiene «Ve lo
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
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { name: true, email: true, cajaGrantedBy: true } });
  const acc = accessOf(session);
  // Lo que cambia según quién mira: cerrar el día, prestar la caja y si la tiene prestada.
  const who: Who = { canCloseDay: acc.cierreDia, canLend: acc.anular, lent: acc.prestada || (acc.cierreDia && !acc.anular) ? { by: user?.cajaGrantedBy ?? null, closeDay: acc.cierreDia, until: session.cajaUntil ?? null } : null };
  return { tenant, session, storeId, userName: user?.name || user?.email || null, who };
}

const SHIFT_SELECT = { id: true, number: true, startedAt: true, endedAt: true, startedByName: true, closedByName: true, openingCashCents: true, expectedCashCents: true, countedCashCents: true, differenceCents: true, summary: true, notes: true } as const;

type Who = { canCloseDay: boolean; canLend: boolean; lent: { by: string | null; closeDay: boolean; until: Date | string | null } | null };

async function payload(tenantId: string, storeId: string, seesTakings: boolean, who: Who) {
  const open = await openSession(tenantId, storeId);
  const cur = open ? await shiftFigures(open) : null;
  const dayFigures = open && seesTakings ? await sessionFigures(open) : null;
  const history = seesTakings
    ? await prisma.cashSession.findMany({
        where: { tenantId, storeId, closedAt: { not: null } },
        orderBy: { closedAt: "desc" },
        take: 31, // un mes de cierres
        select: { id: true, openedAt: true, closedAt: true, openedByName: true, closedByName: true, openingFloatCents: true, countedCashCents: true, expectedCashCents: true, differenceCents: true, summary: true, notes: true, shifts: { orderBy: { number: "asc" }, select: SHIFT_SELECT } },
      })
    : [];
  return {
    seesTakings,
    ...who,
    open: open && {
      id: open.id,
      openedAt: open.openedAt,
      openedByName: open.openedByName,
      openingFloatCents: open.openingFloatCents,
      movements: open.movements.map((m) => ({ id: m.id, kind: m.kind, amountCents: m.amountCents, reason: m.reason, userName: m.userName, createdAt: m.createdAt })),
      shift: cur && { number: cur.shift.number, startedAt: cur.shift.startedAt, startedByName: cur.shift.startedByName, openingCashCents: seesTakings ? cur.shift.openingCashCents : null },
      // Turnos ya cerrados hoy; quien cuenta a ciegas solo ve hora y quién.
      shifts: open.shifts.map((sh) =>
        seesTakings
          ? { id: sh.id, number: sh.number, startedAt: sh.startedAt, endedAt: sh.endedAt, startedByName: sh.startedByName, closedByName: sh.closedByName, openingCashCents: sh.openingCashCents, expectedCashCents: sh.expectedCashCents, countedCashCents: sh.countedCashCents, differenceCents: sh.differenceCents, summary: sh.summary, notes: sh.notes }
          : { id: sh.id, number: sh.number, startedAt: sh.startedAt, endedAt: sh.endedAt, startedByName: sh.startedByName, closedByName: sh.closedByName, notes: sh.notes }
      ),
    },
    figures: seesTakings && cur ? cur.figures : null, // el turno en curso
    dayFigures, // todo el día
    history,
    reasons: MOVE_REASONS,
  };
}

export async function GET(req: NextRequest) {
  try {
    const c = await ctx(req);
    if ("error" in c) return c.error;
    return NextResponse.json(await payload(c.tenant.id, c.storeId, Boolean(c.session.seesTakings), c.who));
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
    const canCloseDay = c.who.canCloseDay; // encargado, gerente o a quien se lo presten
    const out = () => payload(tenant.id, storeId, sees, c.who);
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
      return NextResponse.json(await out());
    }

    // Volver a imprimir un cierre ya hecho (hoy o días anteriores).
    if (b.action === "reprint") {
      if (!sees) return NextResponse.json({ error: "Para ver las cifras hace falta el permiso «Ve lo recaudado»" }, { status: 403 });
      const id = typeof b.sessionId === "string" ? b.sessionId : "";
      const s = await prisma.cashSession.findFirst({ where: { id, tenantId: tenant.id, storeId, closedAt: { not: null } }, select: { id: true } });
      if (!s) return NextResponse.json({ error: "Ese cierre no existe" }, { status: 404 });
      const printed = await enqueueClosing(s.id, b.detailed === true);
      return NextResponse.json({ printed });
    }

    if (b.action === "reprintShift") {
      if (!sees) return NextResponse.json({ error: "Para ver las cifras hace falta el permiso «Ve lo recaudado»" }, { status: 403 });
      const id = typeof b.shiftId === "string" ? b.shiftId : "";
      const sh = await prisma.cashShift.findFirst({ where: { id, session: { tenantId: tenant.id, storeId } }, select: { id: true } });
      if (!sh) return NextResponse.json({ error: "Ese turno no existe" }, { status: 404 });
      return NextResponse.json({ printed: await enqueueShift(sh.id) });
    }

    if (!current) return NextResponse.json({ error: "La caja está cerrada. Ábrela primero." }, { status: 400 });

    if (b.action === "move") {
      const amount = cents(b.amountCents);
      if (!amount) return NextResponse.json({ error: "Escribe un importe" }, { status: 400 });
      const kind = b.kind === "IN" ? "IN" : b.kind === "OUT" ? "OUT" : null;
      if (!kind) return NextResponse.json({ error: "Elige si entra o sale dinero" }, { status: 400 });
      const reason = (typeof b.reason === "string" && b.reason.trim().slice(0, 80)) || "Otro";
      await prisma.cashMovement.create({ data: { sessionId: current.id, kind, amountCents: amount, reason, userName } });
      return NextResponse.json(await out());
    }

    // Cierre parcial (informe X): cifras hasta ahora en la impresora, sin cerrar.
    if (b.action === "partial") {
      if (!sees) return NextResponse.json({ error: "Para ver las cifras hace falta el permiso «Ve lo recaudado»" }, { status: 403 });
      const fig = await sessionFigures(current, new Date());
      const printed = await enqueuePartialClosing(current, fig, userName);
      return NextResponse.json({ printed });
    }

    // Cerrar turno (X) o cerrar el día (Z). Los dos cuentan el cajón del turno
    // en curso; si no cuadra, la nota es obligatoria.
    if (b.action === "shift" || b.action === "close") {
      const isDay = b.action === "close";
      if (isDay && !canCloseDay) return NextResponse.json({ error: "El cierre del día lo hace el encargado o el gerente. Tú puedes cerrar tu turno." }, { status: 403 });
      const counted = cents(b.countedCents);
      if (counted == null) return NextResponse.json({ error: "Escribe el efectivo que has contado en el cajón" }, { status: 400 });
      const endedAt = new Date();
      const { shift, figures } = await shiftFigures(current, endedAt);
      const difference = counted - figures.expectedCashCents;
      const notes = typeof b.notes === "string" && b.notes.trim() ? b.notes.trim().slice(0, 300) : null;
      if (difference !== 0 && !notes) {
        return NextResponse.json({ error: "La caja no cuadra: escribe una nota explicando por qué", needNote: true, ...(sees ? { differenceCents: difference } : {}) }, { status: 400 });
      }
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"caja:" + storeId}))`;
        const fresh = await tx.cashSession.findFirst({ where: { id: current.id, closedAt: null }, include: { shifts: { select: { number: true } } } });
        if (!fresh) return { error: "Esta caja ya se ha cerrado" };
        const lastNumber = Math.max(0, ...fresh.shifts.map((x) => x.number));
        if (lastNumber + 1 !== shift.number) return { error: "Alguien acaba de cerrar este turno. Vuelve a mirar la caja." };
        const created = await tx.cashShift.create({
          data: {
            sessionId: current.id,
            number: shift.number,
            startedAt: shift.startedAt,
            endedAt,
            startedByName: shift.startedByName,
            closedByUserId: session.userId,
            closedByName: userName,
            openingCashCents: shift.openingCashCents,
            expectedCashCents: figures.expectedCashCents,
            countedCashCents: counted,
            differenceCents: difference,
            summary: summaryOf(figures) as unknown as Prisma.InputJsonValue,
            notes,
          },
        });
        if (isDay) {
          const day = await sessionFigures(current, endedAt);
          const prevDiff = (await tx.cashShift.aggregate({ where: { sessionId: current.id, id: { not: created.id } }, _sum: { differenceCents: true } }))._sum.differenceCents ?? 0;
          await tx.cashSession.update({
            where: { id: current.id },
            data: {
              closedAt: endedAt,
              closedByUserId: session.userId,
              closedByName: userName,
              countedCashCents: counted,
              expectedCashCents: day.expectedCashCents,
              differenceCents: prevDiff + difference, // el descuadre del día = la suma de los turnos
              notes,
              summary: summaryOf(day) as unknown as Prisma.InputJsonValue,
            },
          });
          // Cerrado el día, la caja prestada a camareros caduca.
          await tx.user.updateMany({ where: { tenantId: tenant.id, cajaUntil: { not: null } }, data: { cajaUntil: null, cajaCloseDay: false, cajaGrantedBy: null } });
          return { shiftId: created.id, day };
        }
        return { shiftId: created.id, day: null };
      });
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
      // En papel solo si quien cierra ve lo recaudado (quien cuenta a ciegas no recibe cifras).
      if (sees) {
        if (isDay) await enqueueClosing(current.id).catch((e) => console.error("[cierre Z] imprimir", e));
        else await enqueueShift(result.shiftId).catch((e) => console.error("[cierre X] imprimir", e));
      }
      const closedSession = isDay ? await prisma.cashSession.findUnique({ where: { id: current.id }, select: { differenceCents: true } }) : null;
      return NextResponse.json({
        ...(await out()),
        closed: {
          kind: isDay ? "Z" : "X",
          id: isDay ? current.id : result.shiftId,
          shiftNumber: shift.number,
          countedCashCents: counted,
          ...(sees ? { expectedCashCents: figures.expectedCashCents, differenceCents: difference, figures, dayFigures: result.day, dayDifferenceCents: closedSession?.differenceCents ?? null } : {}),
        },
      });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/admin/caja/sesion]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
