import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { rateLimit } from "@/app/lib/rateLimit";
import { createRiderToken, setRiderCookie } from "@/app/lib/riderSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const limited = await rateLimit(req, "rider-login", 8, 60);
  if (limited) return limited;
  try {
    const { tenant: slug } = await params;
    const body = (await req.json().catch(() => ({}))) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!/^\d{10}$/.test(code)) return NextResponse.json({ error: "Código no válido" }, { status: 400 });

    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "Comercio no encontrado" }, { status: 404 });
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 16) throw new Error("SESSION_SECRET no está configurado");
    const accessCodeHash = createHmac("sha256", secret).update(code).digest("hex");
    const rider = await prisma.deliveryRider.findFirst({
      where: { tenantId: tenant.id, active: true, accessCodeHash },
      select: { id: true, name: true, accessCodeIssuedAt: true },
    });
    if (!rider?.accessCodeIssuedAt) return NextResponse.json({ error: "Código incorrecto o caducado" }, { status: 401 });

    const token = await createRiderToken(rider.id, tenant.id, rider.accessCodeIssuedAt.getTime());
    const response = NextResponse.json({ ok: true, rider: { name: rider.name } });
    response.cookies.set(setRiderCookie(token));
    return response;
  } catch (error) {
    console.error("[POST /api/repartidor/login]", error);
    return NextResponse.json({ error: "No se pudo iniciar sesión" }, { status: 500 });
  }
}
