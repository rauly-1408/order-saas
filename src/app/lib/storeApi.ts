import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin, getSessionFromRequest } from "@/app/lib/auth";
import { DAY_KEYS, normalizePostalCode, parseHours, type WeeklyHours } from "@/app/lib/storeStatus";

// Guard de /api/admin/[tenant]/store/*. Horario, cierres y zonas: dueño o
// superadmin. Pausa y tiempo extra (staff: true): también el encargado de tienda.
export async function storeTenant(
  req: NextRequest,
  opts: { staff?: boolean } = {}
): Promise<{ tenant: { id: string; settings: unknown }; storeId: string } | { error: NextResponse }> {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, settings: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  if (opts.staff) {
    const session = await getSessionFromRequest(req);
    if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
    if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return { error: NextResponse.json({ error: "Prohibido" }, { status: 403 }) };
  } else {
    const denied = await denyUnlessTenantAdmin(req, tenant.id);
    if (denied) return { error: denied };
  }
  const store = await prisma.store.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!store) return { error: NextResponse.json({ error: "El restaurante no tiene local" }, { status: 404 }) };
  return { tenant, storeId: store.id };
}

// Horario semanal enviado por el panel → validado (máx. 3 franjas por día).
export function parseHoursInput(raw: unknown): WeeklyHours | string {
  const r = (raw ?? {}) as Record<string, unknown>;
  for (const d of DAY_KEYS) {
    const list = r[d];
    if (list !== undefined && (!Array.isArray(list) || list.length > 3)) return "Horario no válido";
  }
  const hours = parseHours(r);
  for (const d of DAY_KEYS) {
    const given = Array.isArray(r[d]) ? (r[d] as unknown[]).length : 0;
    if (hours[d].length !== given) return "Revisa las horas: usa el formato HH:MM y que apertura y cierre no coincidan";
  }
  return hours;
}

export type ZoneInput = { name: string; postalCodes: string[]; feeCents: number; minOrderCents: number; active: boolean };

export function parseZone(body: unknown): ZoneInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
  if (!name) return "Ponle un nombre a la zona";
  const raw = Array.isArray(b.postalCodes) ? b.postalCodes : typeof b.postalCodes === "string" ? b.postalCodes.split(/[\s,;]+/) : [];
  const postalCodes = [...new Set(raw.map((c) => normalizePostalCode(String(c))).filter((c) => c.length === 5))];
  if (!postalCodes.length) return "Añade al menos un código postal de 5 cifras";
  const feeCents = Number(b.feeCents);
  const minOrderCents = b.minOrderCents == null || b.minOrderCents === "" ? 0 : Number(b.minOrderCents);
  if (!Number.isInteger(feeCents) || feeCents < 0) return "Coste de envío no válido";
  if (!Number.isInteger(minOrderCents) || minOrderCents < 0) return "Pedido mínimo no válido";
  return { name, postalCodes, feeCents, minOrderCents, active: b.active !== false };
}
