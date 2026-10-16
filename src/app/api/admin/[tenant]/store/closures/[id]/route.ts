import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { storeTenant } from "@/app/lib/storeApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  const ctx = await storeTenant(req);
  if ("error" in ctx) return ctx.error;
  const id = new URL(req.url).pathname.split("/").pop() ?? "";
  const res = await prisma.storeClosure.deleteMany({ where: { id, storeId: ctx.storeId } });
  if (res.count === 0) return NextResponse.json({ error: "Cierre no encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
