import { createHmac, randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hashCode(code: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) throw new Error("SESSION_SECRET no está configurado");
  return createHmac("sha256", secret).update(code).digest("hex");
}

// POST: genera un código nuevo y lo devuelve una sola vez. La base de datos solo guarda su HMAC.
export async function POST(req: NextRequest, { params }: { params: Promise<{ tenant: string; id: string }> }) {
  try {
    const { tenant: slug, id } = await params;
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "Comercio no encontrado" }, { status: 404 });
    const denied = await denyUnlessTenantAdmin(req, tenant.id);
    if (denied) return denied;

    const rider = await prisma.deliveryRider.findFirst({ where: { id, tenantId: tenant.id, active: true }, select: { id: true } });
    if (!rider) return NextResponse.json({ error: "Repartidor no encontrado o inactivo" }, { status: 404 });

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = String(randomInt(1000000000, 9999999999));
      const accessCodeHash = hashCode(code);
      try {
        const updated = await prisma.deliveryRider.updateMany({
          where: { id: rider.id, tenantId: tenant.id, active: true },
          data: { accessCodeHash, accessCodeIssuedAt: new Date() },
        });
        if (!updated.count) return NextResponse.json({ error: "El repartidor ha sido dado de baja. Actualiza la lista e inténtalo de nuevo." }, { status: 409 });
        return NextResponse.json({ code });
      } catch (error) {
        // Solo repetir ante una colisión real del índice único; otros errores
        // de base de datos deben salir inmediatamente para no ocultar el problema.
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002" && attempt < 4) continue;
        throw error;
      }
    }
    return NextResponse.json({ error: "No se pudo generar el código" }, { status: 500 });
  } catch (error) {
    console.error("[POST /api/admin/repartidores/codigo]", error);
    return NextResponse.json({ error: "No se pudo generar el código de acceso" }, { status: 500 });
  }
}
