import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/app/lib/rateLimit";
import { prisma } from "@/app/lib/prisma";
import { suggestAddresses } from "@/app/lib/address";
import { readBusiness } from "@/app/lib/business";

export const runtime = "nodejs";

// GET /api/address/[tenant]?q=arabial 9 → sugerencias de dirección para el
// checkout y el pedido a domicilio del panel. Solo de la provincia del
// restaurante: la de sus zonas de reparto, su código postal (Configuración →
// datos del negocio) y el de sus locales. Público y sin guardar nada.
export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const limited = await rateLimit(req, "address", 60, 60);
  if (limited) return limited;
  const { tenant } = await params;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 3) return NextResponse.json({ suggestions: [] });
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { id: true, settings: true } });
  if (!t) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  const [zones, stores] = await Promise.all([
    prisma.deliveryZone.findMany({ where: { active: true, store: { tenantId: t.id } }, select: { postalCodes: true } }),
    prisma.store.findMany({ where: { tenantId: t.id }, select: { address: true } }),
  ]);
  const own = [readBusiness(t.settings).postalCode, ...stores.flatMap((s) => s.address?.match(/\b\d{5}\b/g) ?? [])];
  const postalCodes = [...new Set([...zones.flatMap((z) => z.postalCodes), ...own].filter((cp): cp is string => !!cp && /^\d{5}$/.test(cp)))];
  try {
    const suggestions = await suggestAddresses(q, postalCodes);
    return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    // Si el servicio de direcciones no responde, el cliente escribe a mano.
    return NextResponse.json({ suggestions: [] });
  }
}
