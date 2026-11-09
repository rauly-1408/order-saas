// Autenticación de las rutas del panel de Reservas: quien tenga acceso a Mesas.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessArea, getSessionFromRequest } from "@/app/lib/auth";

export async function reservationsAuth(req: NextRequest, slug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true, settings: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Restaurante no encontrado" }, { status: 404 }) };
  const session = await getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return { error: NextResponse.json({ error: "Prohibido" }, { status: 403 }) };
  const noArea = denyUnlessArea(session, "mesas");
  if (noArea) return { error: noArea };
  return { tenant, session };
}
