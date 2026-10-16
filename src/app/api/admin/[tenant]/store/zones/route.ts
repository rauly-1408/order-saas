import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { parseZone, storeTenant } from "@/app/lib/storeApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST → nueva zona de reparto
export async function POST(req: NextRequest) {
  const ctx = await storeTenant(req);
  if ("error" in ctx) return ctx.error;
  const input = parseZone(await req.json().catch(() => null));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  const count = await prisma.deliveryZone.count({ where: { storeId: ctx.storeId } });
  const zone = await prisma.deliveryZone.create({ data: { storeId: ctx.storeId, sortOrder: count, ...input } });
  return NextResponse.json({ zone }, { status: 201 });
}
