import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { rateLimit } from "@/app/lib/rateLimit";
import { notifyReservation, notifyWaitlist } from "@/app/lib/reservationsDb";

// El cliente cancela su reserva, o confirma que va (botón del recordatorio),
// desde el enlace del email. Ver docs/RESERVAS.md
export async function POST(req: NextRequest, { params }: { params: Promise<{ tenant: string; code: string }> }) {
  const limited = await rateLimit(req, "reservas-cancelar", 10, 60);
  if (limited) return limited;
  const { tenant, code } = await params;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (b.action !== "cancel" && b.action !== "confirm") return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  const r = await prisma.reservation.findUnique({
    where: { code },
    select: { id: true, status: true, startsAt: true, storeId: true, customerConfirmedAt: true, tenant: { select: { id: true, slug: true, name: true, settings: true } } },
  });
  if (!r || r.tenant.slug !== tenant) return NextResponse.json({ error: "No encontramos esta reserva" }, { status: 404 });

  if (b.action === "confirm") {
    if (r.customerConfirmedAt) return NextResponse.json({ ok: true });
    if (r.status !== "CONFIRMED" || r.startsAt.getTime() < Date.now()) return NextResponse.json({ error: "Esta reserva ya no se puede confirmar" }, { status: 409 });
    await prisma.reservation.update({ where: { id: r.id }, data: { customerConfirmedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }

  if (r.status === "CANCELLED") return NextResponse.json({ ok: true });
  if (!["PENDING", "CONFIRMED", "WAITLIST"].includes(r.status) || r.startsAt.getTime() < Date.now()) return NextResponse.json({ error: "Esta reserva ya no se puede cancelar. Llama al restaurante." }, { status: 409 });
  await prisma.reservation.update({ where: { id: r.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: "CUSTOMER" } });
  if (r.status !== "WAITLIST") {
    after(() => notifyReservation(r.id, "cancelled", b.lang === "en" ? "en" : "es"));
    after(() => notifyWaitlist(r.tenant, r.storeId, r.startsAt));
  }
  return NextResponse.json({ ok: true });
}
