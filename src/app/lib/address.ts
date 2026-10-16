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
