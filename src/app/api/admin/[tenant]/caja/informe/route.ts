import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessArea, getSessionFromRequest } from "@/app/lib/auth";
import { enqueueCashReport, previewCashReport, type CashReport } from "@/app/lib/printing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Informes de caja ya cerrados, con vista previa antes de imprimir (como los tickets).
//   GET  ?session=id[&detailed=1] | ?shift=id → vista previa, una por impresora de tickets
//   GET  ?jobs=id1,id2                       → cómo van esos trabajos
//   POST { sessionId, detailed? } | { shiftId } → imprime; devuelve los trabajos
// Con Caja y «Ve lo recaudado». Ver docs/CAJA.md y docs/IMPRESION.md

async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const session = await getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return { error: NextResponse.json({ error: "Prohibido" }, { status: 403 }) };
  const noArea = denyUnlessArea(session, "caja");
  if (noArea) return { error: noArea };
  if (!session.seesTakings) return { error: NextResponse.json({ error: "Para ver las cifras hace falta el permiso «Ve lo recaudado»" }, { status: 403 }) };
  return { tenantId: tenant.id, storeId: session.storeId ?? null };
}

// Comprueba que el informe es de este restaurante (y de su local, si tiene uno).
async function reportOf(c: { tenantId: string; storeId: string | null }, v: { sessionId?: unknown; shiftId?: unknown; detailed?: unknown }): Promise<CashReport | null> {
  const where = { tenantId: c.tenantId, closedAt: { not: null }, ...(c.storeId ? { storeId: c.storeId } : {}) };
  if (typeof v.shiftId === "string" && v.shiftId) {
    const sh = await prisma.cashShift.findFirst({ where: { id: v.shiftId, session: { tenantId: c.tenantId, ...(c.storeId ? { storeId: c.storeId } : {}) } }, select: { id: true } });
    return sh ? { shiftId: sh.id } : null;
  }
  if (typeof v.sessionId === "string" && v.sessionId) {
    const s = await prisma.cashSession.findFirst({ where: { id: v.sessionId, ...where }, select: { id: true } });
    return s ? { sessionId: s.id, detailed: v.detailed === true || v.detailed === "1" } : null;
  }
  return null;
}
const NO_PRINTER = "No hay ninguna impresora de tickets configurada. Usa «En este ordenador».";

export async function GET(req: NextRequest) {
  try {
    const c = await ctx(req);
    if ("error" in c) return c.error;
    const q = new URL(req.url).searchParams;
    const jobIds = (q.get("jobs") ?? "").split(",").filter(Boolean).slice(0, 20);
    if (jobIds.length) {
      const jobs = await prisma.printJob.findMany({ where: { id: { in: jobIds }, tenantId: c.tenantId, kind: "CLOSING" }, select: { id: true, status: true, error: true } });
      return NextResponse.json({ jobs });
    }
    const rep = await reportOf(c, { sessionId: q.get("session"), shiftId: q.get("shift"), detailed: q.get("detailed") });
    if (!rep) return NextResponse.json({ error: "Ese cierre no existe" }, { status: 404 });
    const r = await previewCashReport(rep);
    if (!r?.items.length) return NextResponse.json({ error: NO_PRINTER }, { status: 400 });
    return NextResponse.json(r);
  } catch (err) {
    console.error("[GET /api/admin/caja/informe]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const c = await ctx(req);
    if ("error" in c) return c.error;
    const b = (await req.json().catch(() => ({}))) as { sessionId?: unknown; shiftId?: unknown; detailed?: unknown };
    const rep = await reportOf(c, b);
    if (!rep) return NextResponse.json({ error: "Ese cierre no existe" }, { status: 404 });
    const jobs = await enqueueCashReport(rep);
    if (!jobs.length) return NextResponse.json({ error: NO_PRINTER }, { status: 400 });
    return NextResponse.json({ ok: true, jobs });
  } catch (err) {
    console.error("[POST /api/admin/caja/informe]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
