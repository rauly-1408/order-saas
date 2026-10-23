import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { readPrinting } from "@/app/lib/printing";
import { rateLimit } from "@/app/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/print/jobs → trabajos pendientes para el agente de impresión del
// local. Se identifica con el token de Configuración → Impresoras
// (Authorization: Bearer …). Ver docs/IMPRESION.md y tools/print-agent.

async function tenantByToken(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return prisma.tenant.findFirst({ where: { settings: { path: ["printing", "agentToken"], equals: token } }, select: { id: true, settings: true } });
}

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, "print-agent", 120, 60); // el agente pregunta cada 2 s
  if (limited) return limited;
  try {
    const tenant = await tenantByToken(req);
    if (!tenant) return NextResponse.json({ error: "Token no válido" }, { status: 401 });

    // «Visto por última vez»: se guarda como mucho una vez por minuto.
    const cfg = readPrinting(tenant.settings);
    const seen = cfg.agentSeenAt ? Date.parse(cfg.agentSeenAt) : 0;
    if (Date.now() - seen > 60_000) {
      // Solo esa clave: reescribir toda la configuración podría deshacer un
      // cambio que el gerente guarde a la vez (p. ej. un token nuevo).
      const iso = new Date().toISOString();
      await prisma.$executeRaw`UPDATE "Tenant" SET settings = jsonb_set(settings::jsonb, '{printing,agentSeenAt}', to_jsonb(${iso}::text)) WHERE id = ${tenant.id} AND settings::jsonb ? 'printing'`;
    }

    // No imprimir lo que ya no sirve: pedidos cancelados o trabajos de hace más
    // de 2 horas (p. ej. si el agente estuvo apagado toda la noche).
    const stale = new Date(Date.now() - 2 * 3_600_000);
    await prisma.printJob.updateMany({ where: { tenantId: tenant.id, status: "PENDING", createdAt: { lt: stale } }, data: { status: "FAILED", error: "Caducado: llevaba más de 2 horas en cola" } });
    const cancelled = await prisma.printJob.findMany({ where: { tenantId: tenant.id, status: "PENDING", orderId: { not: null } }, select: { id: true, orderId: true } });
    if (cancelled.length) {
      const dead = await prisma.order.findMany({ where: { id: { in: cancelled.map((j) => j.orderId!) }, status: "CANCELLED" }, select: { id: true } });
      if (dead.length) await prisma.printJob.updateMany({ where: { tenantId: tenant.id, status: "PENDING", orderId: { in: dead.map((o) => o.id) } }, data: { status: "FAILED", error: "Pedido cancelado" } });
    }

    // Con varios locales, cada agente pide solo los de las impresoras de su local (--store).
    const store = new URL(req.url).searchParams.get("store");
    const printerIds = store ? cfg.printers.filter((p) => !p.storeId || p.storeId === store).map((p) => p.id) : null;
    const jobs = await prisma.printJob.findMany({
      where: { tenantId: tenant.id, status: "PENDING", attempts: { lt: 5 }, ...(printerIds && { printerId: { in: printerIds } }) },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: { id: true, kind: true, host: true, port: true, data: true, attempts: true },
    });
    return NextResponse.json({
      jobs: jobs.map((j) => ({ id: j.id, kind: j.kind, host: j.host, port: j.port, attempts: j.attempts, data: Buffer.from(j.data).toString("base64") })),
    });
  } catch (err) {
    console.error("[GET /api/print/jobs]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// POST /api/print/jobs { id, ok, error? } → el agente confirma impreso o fallo.
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, "print-agent-ack", 240, 60);
  if (limited) return limited;
  try {
    const tenant = await tenantByToken(req);
    if (!tenant) return NextResponse.json({ error: "Token no válido" }, { status: 401 });
    const b = (await req.json().catch(() => ({}))) as { id?: unknown; ok?: unknown; error?: unknown };
    if (typeof b.id !== "string") return NextResponse.json({ error: "Falta id" }, { status: 400 });
    const job = await prisma.printJob.findFirst({ where: { id: b.id, tenantId: tenant.id } });
    if (!job) return NextResponse.json({ error: "Trabajo no encontrado" }, { status: 404 });
    const ok = b.ok === true;
    const error = typeof b.error === "string" ? b.error.slice(0, 200) : null;
    const attempts = job.attempts + 1;
    await prisma.printJob.update({
      where: { id: job.id },
      data: ok ? { status: "PRINTED", printedAt: new Date(), attempts, error: null } : { status: attempts >= 5 ? "FAILED" : "PENDING", attempts, error },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/print/jobs]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
