import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { readPrinting } from "@/app/lib/printing";

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
  try {
    const tenant = await tenantByToken(req);
    if (!tenant) return NextResponse.json({ error: "Token no válido" }, { status: 401 });

    // «Visto por última vez»: se guarda como mucho una vez por minuto.
    const cfg = readPrinting(tenant.settings);
    const seen = cfg.agentSeenAt ? Date.parse(cfg.agentSeenAt) : 0;
    if (Date.now() - seen > 60_000) {
      const settings = tenant.settings as Record<string, unknown>;
      const printing = { ...((settings.printing as Record<string, unknown>) ?? {}), agentSeenAt: new Date().toISOString() };
      await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: { ...settings, printing } as object } });
    }

    const jobs = await prisma.printJob.findMany({
      where: { tenantId: tenant.id, status: "PENDING", attempts: { lt: 5 } },
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
