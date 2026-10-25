import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant } from "@/app/lib/costsApi";
import { aiConfigured, AiError } from "@/app/lib/anthropic";
import { scanSupplierDocument } from "@/app/lib/invoiceScan";
import { SCAN_MEDIA_TYPES, type ScanMediaType } from "@/app/lib/invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // leer un documento puede tardar 20-60 s (facturas largas, hasta 2-3 min)

const DAILY_LIMIT = 20;
const MAX_BASE64_CHARS = 5_500_000; // ≈ 4 MB de archivo (límite de Vercel: 4,5 MB por petición)

// Límite diario por restaurante (por instancia del servidor).
const usage = new Map<string, { day: string; count: number }>();
function takeQuota(tenantId: string): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const u = usage.get(tenantId);
  if (!u || u.day !== day) {
    usage.set(tenantId, { day, count: 1 });
    return true;
  }
  if (u.count >= DAILY_LIMIT) return false;
  u.count++;
  return true;
}

// POST { mediaType, data (base64) } → lectura del albarán para revisar
export async function POST(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  if (!aiConfigured()) return NextResponse.json({ error: "La lectura con IA no está activada todavía." }, { status: 503 });

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (!SCAN_MEDIA_TYPES.includes(b.mediaType as ScanMediaType)) {
    return NextResponse.json({ error: "Sube una foto (JPG, PNG, WebP) o un PDF" }, { status: 400 });
  }
  if (typeof b.data !== "string" || !b.data || b.data.length > MAX_BASE64_CHARS || !/^[A-Za-z0-9+/=]+$/.test(b.data)) {
    return NextResponse.json({ error: "El archivo no es válido o pesa más de 4 MB" }, { status: 400 });
  }
  if (!takeQuota(ctx.tenant.id)) {
    return NextResponse.json({ error: `Has llegado al máximo de ${DAILY_LIMIT} lecturas de hoy.` }, { status: 429 });
  }

  const [ingredients, suppliers] = await Promise.all([
    prisma.ingredient.findMany({
      where: { tenantId: ctx.tenant.id },
      select: { id: true, name: true, baseUnit: true, packSize: true, packPriceCents: true, supplierId: true },
      orderBy: { name: "asc" },
    }),
    prisma.supplier.findMany({ where: { tenantId: ctx.tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  try {
    const result = await scanSupplierDocument({ mediaType: b.mediaType as ScanMediaType, data: b.data }, ingredients, suppliers);
    return NextResponse.json({ result });
  } catch (err) {
    if (err instanceof AiError) return NextResponse.json({ error: err.message }, { status: 502 });
    console.error("[POST costs/invoice-scan]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
