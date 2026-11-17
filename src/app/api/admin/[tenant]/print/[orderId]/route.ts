import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";
import { enqueueOrderPrintJobs, previewOrderPrint } from "@/app/lib/printing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Comanda o ticket de un pedido. Cualquier usuario del restaurante (también el rol «Pedidos»).
//   GET  ?kind=KITCHEN|RECEIPT → vista previa, una por impresora (lo mismo que va a salir)
//   GET  ?jobs=id1,id2         → cómo van esos trabajos (en cola, impreso o fallo)
//   POST { kind }              → reimprime; devuelve los ids de los trabajos
// Ver docs/IMPRESION.md
async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const orderId = parts[parts.length - 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const session = await getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return { error: NextResponse.json({ error: "Prohibido" }, { status: 403 }) };
  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId: tenant.id }, select: { id: true, storeId: true } });
  if (!order) return { error: NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 }) };
  if (session.storeId && session.storeId !== order.storeId) return { error: NextResponse.json({ error: "Este pedido es de otro local" }, { status: 403 }) };
  return { tenantId: tenant.id, order };
}
const kindOf = (v: unknown) => (v === "RECEIPT" ? "RECEIPT" : "KITCHEN");
const noPrinter = (kind: "KITCHEN" | "RECEIPT") => (kind === "KITCHEN" ? "No hay ninguna impresora de comandas configurada" : "No hay ninguna impresora de tickets configurada");

export async function GET(req: NextRequest) {
  try {
    const c = await ctx(req);
    if ("error" in c) return c.error;
    const q = new URL(req.url).searchParams;
    const jobIds = (q.get("jobs") ?? "").split(",").filter(Boolean).slice(0, 20);
    if (jobIds.length) {
      const jobs = await prisma.printJob.findMany({ where: { id: { in: jobIds }, tenantId: c.tenantId, orderId: c.order.id }, select: { id: true, status: true, error: true } });
      return NextResponse.json({ jobs });
    }
    const kind = kindOf(q.get("kind"));
    const r = await previewOrderPrint(c.order.id, kind);
    if (!r?.items.length) return NextResponse.json({ error: noPrinter(kind) }, { status: 400 });
    return NextResponse.json(r);
  } catch (err) {
    console.error("[GET /api/admin/print]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const c = await ctx(req);
    if ("error" in c) return c.error;
    const b = (await req.json().catch(() => ({}))) as { kind?: unknown };
    const kind = kindOf(b.kind);
    const jobs = await enqueueOrderPrintJobs(c.order.id, [kind], { reprint: true });
    if (!jobs.length) return NextResponse.json({ error: noPrinter(kind) }, { status: 400 });
    return NextResponse.json({ ok: true, jobs });
  } catch (err) {
    console.error("[POST /api/admin/print]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
