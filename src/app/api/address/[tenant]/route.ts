import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/app/lib/rateLimit";
import { prisma } from "@/app/lib/prisma";
import { suggestAddresses } from "@/app/lib/address";

export const runtime = "nodejs";

// GET /api/address/[tenant]?q=arabial 9 → sugerencias de dirección para el
// checkout. Si el restaurante tiene zonas de reparto, solo se buscan sus
// códigos postales. Público (es lo que escribe el cliente) y sin guardar nada.
export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const limited = await rateLimit(req, "address", 60, 60);
  if (limited) return limited;
  const { tenant } = await params;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 3) return NextResponse.json({ suggestions: [] });
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { id: true } });
  if (!t) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  const zones = await prisma.deliveryZone.findMany({ where: { active: true, store: { tenantId: t.id } }, select: { postalCodes: true } });
  const postalCodes = [...new Set(zones.flatMap((z) => z.postalCodes))];
  try {
    const suggestions = await suggestAddresses(q, postalCodes);
    return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    // Si el servicio de direcciones no responde, el cliente escribe a mano.
    return NextResponse.json({ suggestions: [] });
  }
}
