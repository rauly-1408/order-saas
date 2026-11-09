import { NextRequest, NextResponse, after } from "next/server";
import type { ReservationStatus } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { reservationsAuth } from "@/app/lib/reservationsApi";
import { notifyReservation } from "@/app/lib/reservationsDb";

export const runtime = "nodejs";

// PATCH { status } → confirmar, llegó, no vino, cancelar o deshacer. Al
// confirmar una pendiente o cancelar, se avisa al cliente por email.
const NEXT: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SEATED", "NO_SHOW", "CANCELLED"],
  SEATED: ["CONFIRMED"], // deshacer «Llegó»
  NO_SHOW: ["CONFIRMED"], // deshacer «No vino»
  CANCELLED: ["CONFIRMED"], // recuperar
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params;
  const a = await reservationsAuth(req, tenant);
  if ("error" in a) return a.error;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const r = await prisma.reservation.findFirst({ where: { id, tenantId: a.tenant.id }, select: { id: true, status: true, storeId: true } });
  if (!r || (a.session.storeId && a.session.storeId !== r.storeId)) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  const to = b.status as ReservationStatus;
  if (!NEXT[r.status]?.includes(to)) return NextResponse.json({ error: "Ese cambio no se puede hacer" }, { status: 400 });
  await prisma.reservation.update({
    where: { id: r.id },
    data: { status: to, ...(to === "CANCELLED" ? { cancelledAt: new Date(), cancelledBy: "RESTAURANT" } : { cancelledAt: null, cancelledBy: null }) },
  });
  if (r.status === "PENDING" && to === "CONFIRMED") after(() => notifyReservation(r.id, "confirmed"));
  if (to === "CANCELLED") after(() => notifyReservation(r.id, "cancelled"));
  return NextResponse.json({ ok: true });
}
