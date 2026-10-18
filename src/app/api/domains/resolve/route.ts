import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

// GET /api/domains/resolve?host=pedidos.estafeten.com → { slug } (lo usa proxy.ts
// para abrir la tienda del restaurante en su dominio propio).
export async function GET(req: NextRequest) {
  const host = (new URL(req.url).searchParams.get("host") ?? "").toLowerCase();
  const tenant = host ? await prisma.tenant.findFirst({ where: { domains: { has: host } }, select: { slug: true } }) : null;
  return NextResponse.json({ slug: tenant?.slug ?? null }, { headers: { "Cache-Control": "public, max-age=60" } });
}
