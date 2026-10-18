import { NextRequest, NextResponse, after } from "next/server";
import { autoTranslateMenu } from "@/app/lib/menuTranslate";
import { prisma } from "@/app/lib/prisma";
import { parseLoyalty, retentionTenant } from "@/app/lib/retentionApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/admin/[tenant]/retention/loyalty → crea o actualiza la tarjeta de fidelidad.
// Los sellos cuentan desde que se crea; editarla no borra los que ya hay.
export async function PUT(req: NextRequest) {
  const ctx = await retentionTenant(req);
  if ("error" in ctx) return ctx.error;
  // Carta en inglés: lo nuevo o cambiado se traduce solo, después de responder.
  after(() => autoTranslateMenu(ctx.tenant.id));
  const categories = await prisma.category.findMany({ where: { tenantId: ctx.tenant.id }, select: { id: true } });
  const input = parseLoyalty(await req.json().catch(() => null), new Set(categories.map((c) => c.id)));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  const program = await prisma.loyaltyProgram.upsert({
    where: { tenantId: ctx.tenant.id },
    create: { tenantId: ctx.tenant.id, ...input },
    update: input,
  });
  return NextResponse.json({ program });
}
