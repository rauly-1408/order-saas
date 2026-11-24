import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { readBusiness } from "@/app/lib/business";
import { readVerifactu } from "@/app/lib/verifactu";
import { ctx, payload } from "./shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Configuración → Facturación (VeriFactu). Ver docs/VERIFACTU.md
//   GET → configuración, datos fiscales, estado de la cadena y, con «Ve lo
//         recaudado», los últimos registros
//   PUT { enabled, mode, environment, seriesPrefix }

export async function GET(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  return NextResponse.json(await payload(c.tenant.id, c.tenant.settings, c.sees));
}

export async function PUT(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Solo VERI*FACTU: la modalidad «sin envío» (firma XAdES y registro de eventos) aún no está.
  const next = { ...readVerifactu({ verifactu: b }), mode: "VERIFACTU" as const };
  const biz = readBusiness(c.tenant.settings);
  if (next.enabled && !(biz.taxId && biz.legalName)) {
    return NextResponse.json({ error: "Para facturar con VeriFactu, completa antes la razón social y el NIF en Información del negocio" }, { status: 400 });
  }
  const settings = { ...((c.tenant.settings as Record<string, unknown>) ?? {}), verifactu: next };
  await prisma.tenant.update({ where: { id: c.tenant.id }, data: { settings: settings as object } });
  return NextResponse.json(await payload(c.tenant.id, settings, c.sees));
}
