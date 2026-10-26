import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant } from "@/app/lib/costsApi";
import { DEFAULT_TIMEZONE, addDays, startOfDayIn } from "@/app/lib/time";
import { idleStock, stockReport } from "@/app/lib/stockReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const OUT_TYPES = ["ORDER", "PRODUCTION", "USE"] as const;

// GET ?from=AAAA-MM-DD&to=AAAA-MM-DD&idleDays=7 → informe de stock del periodo
// (ambos días incluidos, hora de Madrid) y género parado.
export async function GET(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;
  const sp = new URL(req.url).searchParams;
  const fromYmd = sp.get("from") ?? "";
  const toYmd = sp.get("to") ?? "";
  if (!YMD.test(fromYmd) || !YMD.test(toYmd) || fromYmd > toYmd) return NextResponse.json({ error: "Fechas no válidas" }, { status: 400 });
  const idleDays = Math.min(Math.max(Math.round(Number(sp.get("idleDays") ?? 7)) || 7, 1), 365);
  const from = startOfDayIn(DEFAULT_TIMEZONE, fromYmd);
  const to = startOfDayIn(DEFAULT_TIMEZONE, addDays(toYmd, 1));
  if (to.getTime() - from.getTime() > 400 * 86_400_000) return NextResponse.json({ error: "Elige como mucho un año" }, { status: 400 });

  const [inRange, ingredients] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { tenantId, createdAt: { gte: from, lt: to } },
      select: { ingredientId: true, type: true, quantity: true, stockAfter: true, valueCents: true, createdAt: true },
    }),
    prisma.ingredient.findMany({ where: { tenantId, trackStock: true }, select: { id: true, trackStock: true, stockQty: true, isActive: true } }),
  ]);

  // Con cuánto empezó cada ingrediente: su último movimiento antes del periodo.
  const ids = [...new Set(inRange.map((m) => m.ingredientId))];
  const before = new Map<string, number>();
  if (ids.length) {
    const last = await prisma.stockMovement.findMany({
      where: { tenantId, ingredientId: { in: ids }, createdAt: { lt: from } },
      orderBy: { createdAt: "desc" },
      distinct: ["ingredientId"],
      select: { ingredientId: true, stockAfter: true },
    });
    for (const m of last) before.set(m.ingredientId, m.stockAfter);
  }

  // Género parado: última salida y primer movimiento de cada ingrediente controlado.
  const trackedIds = ingredients.map((i) => i.id);
  const [lastOuts, firsts] = trackedIds.length
    ? await Promise.all([
        prisma.stockMovement.findMany({
          where: { tenantId, ingredientId: { in: trackedIds }, type: { in: [...OUT_TYPES] }, quantity: { lt: 0 } },
          orderBy: { createdAt: "desc" },
          distinct: ["ingredientId"],
          select: { ingredientId: true, createdAt: true },
        }),
        prisma.stockMovement.findMany({
          where: { tenantId, ingredientId: { in: trackedIds } },
          orderBy: { createdAt: "asc" },
          distinct: ["ingredientId"],
          select: { ingredientId: true, createdAt: true },
        }),
      ])
    : [[], []];
  const idle = idleStock(
    ingredients,
    new Map(lastOuts.map((m) => [m.ingredientId, m.createdAt])),
    new Map(firsts.map((m) => [m.ingredientId, m.createdAt])),
    new Date(),
    idleDays
  );

  return NextResponse.json({ from: fromYmd, to: toYmd, rows: stockReport(inRange, before), idle });
}
