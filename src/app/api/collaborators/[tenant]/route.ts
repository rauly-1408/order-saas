import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/app/lib/rateLimit";
import { prisma } from "@/app/lib/prisma";
import { collaboratorByCode } from "@/app/lib/collaborators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/collaborators/[tenant]?code=LAURA → ¿existe ese código de colaborador?
// Pública (la usa la tienda): solo devuelve el código, el nombre y el descuento
// que tiene el cliente con ese código. Ver docs/COLABORADORES.md
export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, "collaborators", 20, 60);
  if (limited) return limited;
  const url = new URL(req.url);
  const slug = url.pathname.split("/").pop() ?? "";
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  const c = tenant ? await collaboratorByCode(tenant.id, url.searchParams.get("code")) : null;
  if (!c) return NextResponse.json({ error: "Ese código no existe" }, { status: 404 });
  return NextResponse.json({ code: (url.searchParams.get("code") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""), name: c.name.split(" ")[0], discountPct: c.discountPct });
}
