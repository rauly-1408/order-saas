import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant } from "@/app/lib/costsApi";
import { aiConfigured, AiError } from "@/app/lib/anthropic";
import { rateLimit } from "@/app/lib/rateLimit";
import { MAX_DICTATION_CHARS, parseStockDictation } from "@/app/lib/voiceStock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { text } → movimientos de stock propuestos para revisar (no guarda nada).
export async function POST(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const limited = await rateLimit(req, "stock-voice", 40, 600);
  if (limited) return limited;
  if (!aiConfigured()) return NextResponse.json({ error: "El dictado con IA no está activado todavía." }, { status: 503 });

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Dicta o escribe lo que quieres apuntar" }, { status: 400 });
  if (text.length > MAX_DICTATION_CHARS) return NextResponse.json({ error: "Es demasiado de una vez. Dicta menos productos cada vez." }, { status: 400 });

  const ingredients = await prisma.ingredient.findMany({
    where: { tenantId: ctx.tenant.id, isActive: true },
    select: { id: true, name: true, baseUnit: true, packSize: true },
    orderBy: { name: "asc" },
  });
  if (!ingredients.length) return NextResponse.json({ error: "Primero crea tus ingredientes" }, { status: 400 });

  try {
    const lines = await parseStockDictation(text, ingredients);
    return NextResponse.json({ lines });
  } catch (err) {
    if (err instanceof AiError) return NextResponse.json({ error: err.message }, { status: 502 });
    console.error("[POST costs/stock-voice]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
