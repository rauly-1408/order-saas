import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { storeTenant } from "@/app/lib/storeApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { startsAt, endsAt, reason? } → cierre programado (vacaciones, festivo…)
export async function POST(req: NextRequest) {
  const ctx = await storeTenant(req);
  if ("error" in ctx) return ctx.error;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const startsAt = new Date(String(b.startsAt ?? ""));
  const endsAt = new Date(String(b.endsAt ?? ""));
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return NextResponse.json({ error: "Fechas no válidas" }, { status: 400 });
  if (endsAt <= startsAt) return NextResponse.json({ error: "El cierre debe terminar después de empezar" }, { status: 400 });
  if (endsAt <= new Date()) return NextResponse.json({ error: "Ese cierre ya ha pasado" }, { status: 400 });
  const reason = typeof b.reason === "string" && b.reason.trim() ? b.reason.trim().slice(0, 80) : null;
  const closure = await prisma.storeClosure.create({ data: { storeId: ctx.storeId, startsAt, endsAt, reason } });
  return NextResponse.json({ closure }, { status: 201 });
}
