import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getStoreOps } from "@/app/lib/storeOps";
import { parseHoursInput, storeTenant } from "@/app/lib/storeApi";
import { PAUSE_INDEFINITE } from "@/app/lib/storeStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → operativa del local (horario, cierres, zonas, pausa, estado)
export async function GET(req: NextRequest) {
  const ctx = await storeTenant(req, { staff: true });
  if ("error" in ctx) return ctx.error;
  const ops = await getStoreOps(ctx.tenant.id, ctx.tenant.settings);
  return NextResponse.json({ ops });
}

// PATCH { pauseMinutes?: number | "indefinite" | 0, prepExtraMinutes?: number }  (encargado o dueño)
//       { hours?: WeeklyHours }                                                (solo dueño)
export async function PATCH(req: NextRequest) {
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const ctx = await storeTenant(req, { staff: b.hours === undefined });
  if ("error" in ctx) return ctx.error;

  const data: Prisma.StoreUpdateInput = {};
  if (b.pauseMinutes !== undefined) {
    if (b.pauseMinutes === "indefinite") data.pausedUntil = PAUSE_INDEFINITE;
    else {
      const m = Number(b.pauseMinutes);
      if (!Number.isInteger(m) || m < 0 || m > 24 * 60) return NextResponse.json({ error: "Pausa no válida" }, { status: 400 });
      data.pausedUntil = m === 0 ? null : new Date(Date.now() + m * 60_000);
    }
  }
  if (b.prepExtraMinutes !== undefined) {
    const m = Number(b.prepExtraMinutes);
    if (!Number.isInteger(m) || m < 0 || m > 120) return NextResponse.json({ error: "Tiempo extra no válido" }, { status: 400 });
    data.prepExtraMinutes = m;
  }
  if (b.hours !== undefined) {
    const hours = parseHoursInput(b.hours);
    if (typeof hours === "string") return NextResponse.json({ error: hours }, { status: 400 });
    data.openingHours = hours as unknown as Prisma.InputJsonValue;
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nada que cambiar" }, { status: 400 });

  await prisma.store.update({ where: { id: ctx.storeId }, data });
  const ops = await getStoreOps(ctx.tenant.id, ctx.tenant.settings);
  return NextResponse.json({ ops });
}
