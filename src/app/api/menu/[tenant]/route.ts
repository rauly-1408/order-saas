import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/app/lib/rateLimit";
import { loadMenu } from "@/app/lib/menu";
import { prisma } from "@/app/lib/prisma";
import { shopStoreId, storeLang } from "@/app/lib/storeLang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, "menu", 120, 60);
  if (limited) return limited;
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    // pathname: /api/menu/[tenant]
    const tenantSlug = segments[segments.length - 1];

    if (!tenantSlug) {
      return NextResponse.json({ error: "Tenant requerido" }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { settings: true } });
    const menu = await loadMenu(tenantSlug, await storeLang(tenant?.settings), await shopStoreId(), { online: true, delivery: url.searchParams.get("channel") === "DELIVERY" });
    if (!menu) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }
    return NextResponse.json(menu);
  } catch (err) {
    console.error("[GET /api/menu]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
