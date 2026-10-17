// Sugerencias de dirección mientras el cliente escribe (checkout, a domicilio).
// Proveedor: CartoCiudad (Instituto Geográfico Nacional, gratis y sin clave).
// Ver docs/PEDIDOS-PROGRAMADOS.md → "Dirección con sugerencias".

export type AddressSuggestion = {
  label: string; // "Calle Arabial 92, Granada"
  street: string; // "Calle Arabial 92" o "Calle Arabial" si aún no hay número
  postalCode: string | null; // solo si es un portal concreto
  city: string;
  complete: boolean; // true = portal con número; false = calle (falta el número)
};

const CARTOCIUDAD = "https://www.cartociudad.es/geocoder/api/geocoder/candidates";

// "CALLE ARABIAL" → "Calle Arabial" (respeta "de", "del", "la"…).
export function titleCase(s: string): string {
  const small = new Set(["de", "del", "la", "las", "el", "los", "y"]);
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

type Candidate = { type: string; address: string; postalCode: string | null; muni?: string; poblacion?: string; portalNumber?: number | null };

export function toSuggestions(candidates: Candidate[]): AddressSuggestion[] {
  const out: AddressSuggestion[] = [];
  for (const c of candidates) {
    if (c.type !== "portal" && c.type !== "callejero") continue; // fuera tiendas y lugares
    const city = c.poblacion || c.muni || "";
    const base = c.address.replace(/,\s*[^,]*$/, "").replace(/\s*\(.*\)$/, "").trim(); // sin ", Granada" / " (Granada)"
    const street = titleCase(base);
    const complete = c.type === "portal" && c.portalNumber != null;
    const cp = complete && c.postalCode && /^\d{5}$/.test(c.postalCode) ? c.postalCode : null;
    const label = `${street}, ${city}`;
    if (!out.some((s) => s.label === label)) out.push({ label, street, postalCode: cp, city, complete });
  }
  return out.slice(0, 6);
}

// Solo direcciones de la provincia del restaurante (los 2 primeros dígitos del
// código postal de sus zonas). Si está fuera de zona, el checkout lo dice.
export function inProvinces(c: Pick<Candidate, "postalCode">, prefixes: string[]): boolean {
  if (!prefixes.length) return true;
  const codes = (c.postalCode ?? "").split(/\s+/).filter(Boolean);
  return codes.some((cp) => prefixes.includes(cp.slice(0, 2)));
}

export async function suggestAddresses(q: string, postalCodes: string[]): Promise<AddressSuggestion[]> {
  const prefixes = [...new Set(postalCodes.map((cp) => cp.slice(0, 2)))];
  const url = new URL(CARTOCIUDAD);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "25");
  const res = await fetch(url, { signal: AbortSignal.timeout(4000), next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const data = (await res.json()) as Candidate[];
  return Array.isArray(data) ? toSuggestions(data.filter((c) => inProvinces(c, prefixes))) : [];
}

// ─── Coordenadas de una dirección (para el repartidor externo) ─────────────
const CARTOCIUDAD_FIND = "https://www.cartociudad.es/geocoder/api/geocoder/find";

// "Calle Arabial 92, 3ºB" → { street: "Calle Arabial", number: 92, extra: "3ºB" }
export function splitAddress(raw: string): { street: string; number: number; extra: string } | null {
  const m = raw.trim().match(/^(.+?)[\s,]+(?:n[ºo.]?\s*)?(\d{1,4})\b[\s,]*(.*)$/i);
  if (!m) return null;
  return { street: m[1].replace(/,\s*$/, "").trim(), number: Number(m[2]), extra: m[3].trim() };
}

export type Geocoded = { lat: number; lng: number; address: string; extra: string };

// Busca el portal exacto. Devuelve null si no lo encuentra o el número no
// coincide: mejor avisar que mandar al repartidor a otra puerta.
export async function geocodeAddress(raw: string, city: string | null): Promise<Geocoded | null> {
  const parts = splitAddress(raw);
  if (!parts) return null;
  const query = [parts.street, String(parts.number), city].filter(Boolean).join(", ");
  const url = new URL(CARTOCIUDAD_FIND);
  url.searchParams.set("q", query);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const c = (await res.json()) as { lat?: number; lng?: number; portalNumber?: number | null; postalCode?: string; poblacion?: string };
    if (typeof c.lat !== "number" || typeof c.lng !== "number" || c.portalNumber !== parts.number) return null;
    const address = `${titleCase(parts.street)} ${parts.number}, ${c.postalCode ?? ""} ${c.poblacion ?? city ?? ""}`.replace(/\s+/g, " ").trim();
    return { lat: c.lat, lng: c.lng, address, extra: parts.extra };
  } catch {
    return null;
  }
}
