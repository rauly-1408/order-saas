import { NextRequest, NextResponse } from "next/server";
import { loadMenu } from "@/app/lib/menu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    // pathname: /api/menu/[tenant]
    const tenantSlug = segments[segments.length - 1];

    if (!tenantSlug) {
      return NextResponse.json({ error: "Tenant requerido" }, { status: 400 });
    }

    const menu = await loadMenu(tenantSlug);
    if (!menu) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }
    return NextResponse.json(menu);
  } catch (err) {
    console.error("[GET /api/menu]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
