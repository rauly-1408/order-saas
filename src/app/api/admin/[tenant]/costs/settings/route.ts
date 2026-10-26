import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant } from "@/app/lib/costsApi";
import { costSettingsOf } from "@/app/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH: cómo pone sus precios el restaurante y sus gastos fijos
// (Tenant.settings.costs). Se mezcla con lo guardado y se sanea.
export async function PATCH(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenant.id }, select: { settings: true } });
  const settings = (tenant.settings as Record<string, unknown>) ?? {};
  const costs = costSettingsOf({ costs: { ...costSettingsOf(settings), ...b } });
  await prisma.tenant.update({ where: { id: ctx.tenant.id }, data: { settings: { ...settings, costs } as object } });
  return NextResponse.json({ ok: true, costs });
}
