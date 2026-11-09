import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { rateLimit } from "@/app/lib/rateLimit";
import { notifyReservation } from "@/app/lib/reservationsDb";

// El cliente cancela su reserva desde el enlace del email. Ver docs/RESERVAS.md
export async function POST(req: NextRequest, { params }: { params: Promise<{ tenant: string; code: string }> }) {
  const limited = await rateLimit(req, "reservas-cancelar", 10, 60);
  if (limited) return limited;
  const { tenant, code } = await params;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (b.action !== "cancel") return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  const r = await prisma.reservation.findUnique({ where: { code }, select: { id: true, status: true, startsAt: true, tenant: { select: { slug: true } } } });
  if (!r || r.tenant.slug !== tenant) return NextResponse.json({ error: "No encontramos esta reserva" }, { status: 404 });
  if (r.status === "CANCELLED") return NextResponse.json({ ok: true });
  if (!["PENDING", "CONFIRMED"].includes(r.status) || r.startsAt.getTime() < Date.now()) return NextResponse.json({ error: "Esta reserva ya no se puede cancelar. Llama al restaurante." }, { status: 409 });
  await prisma.reservation.update({ where: { id: r.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: "CUSTOMER" } });
  after(() => notifyReservation(r.id, "cancelled", b.lang === "en" ? "en" : "es"));
  return NextResponse.json({ ok: true });
}
