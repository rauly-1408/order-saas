import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { parseZone, storeTenant } from "@/app/lib/storeApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const zoneId = (req: NextRequest) => new URL(req.url).pathname.split("/").pop() ?? "";

export async function PATCH(req: NextRequest) {
  const ctx = await storeTenant(req);
  if ("error" in ctx) return ctx.error;
  const input = parseZone(await req.json().catch(() => null));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  const res = await prisma.deliveryZone.updateMany({ where: { id: zoneId(req), storeId: ctx.storeId }, data: input });
  if (res.count === 0) return NextResponse.json({ error: "Zona no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const ctx = await storeTenant(req);
  if ("error" in ctx) return ctx.error;
  const res = await prisma.deliveryZone.deleteMany({ where: { id: zoneId(req), storeId: ctx.storeId } });
  if (res.count === 0) return NextResponse.json({ error: "Zona no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
