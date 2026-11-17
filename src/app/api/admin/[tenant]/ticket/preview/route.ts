import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { readPrinting, sampleReceipt } from "@/app/lib/printing";
import { rasterPng } from "@/app/lib/printLogo";
import { readTicket } from "@/app/lib/ticketSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/[tenant]/ticket/preview { ticket } → PNG de un ticket de
// ejemplo con esos ajustes (aún sin guardar), del ancho de la impresora de
// tickets del local. Para la vista previa en directo de Configuración → Ticket.
export async function POST(req: NextRequest) {
  try {
    const parts = new URL(req.url).pathname.split("/");
    const slug = parts[parts.indexOf("admin") + 1];
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, settings: true } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    const denied = await denyUnlessTenantAdmin(req, tenant.id);
    if (denied) return denied;
    const b = (await req.json().catch(() => ({}))) as { ticket?: unknown };
    const width = readPrinting(tenant.settings).printers.find((p) => p.roles.includes("receipt"))?.width ?? 48;
    const r = await sampleReceipt(tenant, readTicket({ ticket: b.ticket }), width);
    return NextResponse.json({ src: await rasterPng(r.width, r.height, r.data) });
  } catch (err) {
    console.error("[POST /api/admin/ticket/preview]", err);
    return NextResponse.json({ error: "No se pudo preparar la vista previa" }, { status: 500 });
  }
}
