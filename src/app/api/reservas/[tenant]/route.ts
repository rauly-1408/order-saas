import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { rateLimit } from "@/app/lib/rateLimit";
import { resolveStoreId } from "@/app/lib/stores";
import { cleanText } from "@/app/lib/text";
import { isValidEmail, isValidSpanishPhone } from "@/app/lib/reservations";
import { ReservationError, createReservation, isDuplicateCode, notifyReservation, reservationContext, slotsFor } from "@/app/lib/reservationsDb";
import { localParts } from "@/app/lib/time";

// Reservas desde la tienda: horas libres de un día (GET) y reservar (POST).
// Ver docs/RESERVAS.md
async function load(slug: string, wanted: string | null) {
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, settings: true } });
  if (!tenant) return null;
  const storeId = await resolveStoreId(tenant.id, wanted, { activeOnly: true });
  if (!storeId) return null;
  const ctx = await reservationContext(tenant, storeId);
  return ctx.settings.enabled ? ctx : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const q = new URL(req.url).searchParams;
  const ctx = await load(tenant, q.get("local"));
  if (!ctx) return NextResponse.json({ error: "Este restaurante no acepta reservas online" }, { status: 404 });
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(q.get("fecha") ?? "") ? q.get("fecha")! : localParts(new Date(), ctx.tz).ymd;
  const guests = Math.min(ctx.settings.maxGuestsOnline, Math.max(1, Math.floor(Number(q.get("personas")) || 2)));
  const slots = await slotsFor(ctx, ymd, guests);
  return NextResponse.json({ date: ymd, guests, slots: slots.map(({ at, time, available }) => ({ at, time, available })) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const limited = await rateLimit(req, "reservas", 8, 60);
    if (limited) return limited;
    const { tenant } = await params;
    const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const ctx = await load(tenant, typeof b.storeId === "string" ? b.storeId : null);
    if (!ctx) return NextResponse.json({ error: "Este restaurante no acepta reservas online" }, { status: 404 });
    const startsAt = new Date(typeof b.at === "string" ? b.at : "");
    const guests = Math.floor(Number(b.guests));
    const name = cleanText(b.name, 80);
    const phone = cleanText(b.phone, 20).replace(/[\s-]/g, "");
    const email = cleanText(b.email, 120).toLowerCase() || null;
    const notes = cleanText(b.notes, 300) || null;
    if (Number.isNaN(startsAt.getTime())) return NextResponse.json({ error: "Elige una hora" }, { status: 400 });
    if (!Number.isInteger(guests) || guests < 1) return NextResponse.json({ error: "Indica cuántas personas sois" }, { status: 400 });
    if (guests > ctx.settings.maxGuestsOnline) return NextResponse.json({ error: `Para más de ${ctx.settings.maxGuestsOnline} personas, llámanos` }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Escribe tu nombre" }, { status: 400 });
    if (!isValidSpanishPhone(phone)) return NextResponse.json({ error: "Escribe un teléfono válido (9 cifras)" }, { status: 400 });
    if (email && !isValidEmail(email)) return NextResponse.json({ error: "El email no es válido" }, { status: 400 });
    let r;
    for (let i = 0; ; i++) {
      try {
        r = await createReservation(ctx, { startsAt, guests, name, phone, email, notes }, { source: "ONLINE" });
        break;
      } catch (err) {
        if (i < 2 && isDuplicateCode(err)) continue;
        throw err;
      }
    }
    const lang = b.lang === "en" ? "en" : "es";
    after(() => notifyReservation(r.id, "created", lang));
    return NextResponse.json({ code: r.code, status: r.status });
  } catch (err) {
    if (err instanceof ReservationError) return NextResponse.json({ error: err.message }, { status: 409 });
    console.error("[POST /api/reservas]", err);
    return NextResponse.json({ error: "No se pudo reservar. Inténtalo de nuevo." }, { status: 500 });
  }
}
