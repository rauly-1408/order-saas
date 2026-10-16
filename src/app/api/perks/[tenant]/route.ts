import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { customerPerkState, loadPerks } from "@/app/lib/perks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/perks/[tenant] { phone } → ¿primer pedido? y sellos de la tarjeta.
// Público (lo usa el checkout). El teléfono va en el cuerpo, nunca en la URL, y
// solo se devuelven contadores: ni nombre ni historial.
export async function POST(req: NextRequest) {
  const slug = new URL(req.url).pathname.split("/").pop() ?? "";
  const body = (await req.json().catch(() => null)) as { phone?: unknown } | null;
  const phone = typeof body?.phone === "string" ? body.phone.replace(/[\s-]/g, "") : "";
  if (!/^(?:\+34|0034)?[6789]\d{8}$/.test(phone)) return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, settings: true, addons: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  const perks = await loadPerks(tenant.id, tenant.settings, tenant.addons);
  return NextResponse.json(await customerPerkState(prisma, tenant.id, phone, perks.loyalty));
}
