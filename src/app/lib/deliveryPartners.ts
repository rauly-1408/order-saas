// Reparto con plataformas (Glovo, Uber Eats, Just Eat): para restaurantes sin
// repartidores propios. En la carta, "A domicilio" lleva a la tienda del
// restaurante en la plataforma que elija el cliente. Ver docs/REPARTO-PLATAFORMAS.md

export type PartnerKey = "glovo" | "ubereats" | "justeat";
export type DeliveryPartners = Record<PartnerKey, string | null>;

export const PARTNERS: { key: PartnerKey; label: string; hosts: string[]; example: string }[] = [
  { key: "glovo", label: "Glovo", hosts: ["glovoapp.com"], example: "https://glovoapp.com/es/es/granada/estafeten/" },
  { key: "ubereats", label: "Uber Eats", hosts: ["ubereats.com"], example: "https://www.ubereats.com/es/store/estafeten/…" },
  { key: "justeat", label: "Just Eat", hosts: ["just-eat.es", "justeat.es", "just-eat.com"], example: "https://www.just-eat.es/restaurants-estafeten/menu" },
];

// Solo enlaces https a la web de cada plataforma (nada de enlaces a otros sitios).
export function parsePartners(raw: unknown): DeliveryPartners {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out = { glovo: null, ubereats: null, justeat: null } as DeliveryPartners;
  for (const p of PARTNERS) {
    const v = typeof r[p.key] === "string" ? (r[p.key] as string).trim() : "";
    if (!v) continue;
    try {
      const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      const host = u.hostname.replace(/^www\./, "");
      if (p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
        u.protocol = "https:";
        out[p.key] = u.toString();
      }
    } catch {
      /* enlace no válido: se ignora */
    }
  }
  return out;
}

// Error legible si algún enlace escrito no es de su plataforma (para el panel).
export function partnersProblem(raw: unknown): string | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const parsed = parsePartners(raw);
  for (const p of PARTNERS) {
    const v = typeof r[p.key] === "string" ? (r[p.key] as string).trim() : "";
    if (v && !parsed[p.key]) return `El enlace de ${p.label} no es una dirección de ${p.hosts[0]}`;
  }
  return null;
}

export function activePartners(partners: DeliveryPartners | null | undefined): { key: PartnerKey; label: string; url: string }[] {
  if (!partners) return [];
  return PARTNERS.filter((p) => partners[p.key]).map((p) => ({ key: p.key, label: p.label, url: partners[p.key]! }));
}
