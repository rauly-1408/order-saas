// Datos del negocio (Personalización → Datos del negocio): los que la ley exige
// mostrar en una tienda online en España (LSSI art. 10 y RGPD) y los de contacto.
// Salen en el pie de la tienda y rellenan los textos legales.
// Ver docs/DATOS-NEGOCIO-Y-LEGAL.md

export type BusinessInfo = {
  legalName: string | null; // razón social o nombre y apellidos del titular
  taxId: string | null; // NIF / CIF / NIE
  street: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  registry: string | null; // datos del Registro Mercantil (si es sociedad)
  mapsLink: string | null; // enlace a la ficha del local en Google Maps
};

export const BUSINESS_FIELDS: { key: keyof BusinessInfo; label: string; placeholder: string; required: boolean; full?: boolean; hint?: string }[] = [
  { key: "legalName", label: "Razón social o titular", placeholder: "Estafetén Granada S.L.", required: true, hint: "Si eres autónomo, tu nombre y apellidos." },
  { key: "taxId", label: "NIF / CIF", placeholder: "B12345678", required: true },
  { key: "street", label: "Dirección", placeholder: "Calle Arabial, 92", required: true, full: true },
  { key: "postalCode", label: "Código postal", placeholder: "18004", required: true },
  { key: "city", label: "Ciudad", placeholder: "Granada", required: true },
  { key: "province", label: "Provincia", placeholder: "Granada", required: false },
  { key: "phone", label: "Teléfono", placeholder: "958 00 00 00", required: true },
  { key: "email", label: "Email de contacto", placeholder: "hola@estafeten.com", required: true },
  { key: "whatsapp", label: "WhatsApp (opcional)", placeholder: "600 000 000", required: false },
  { key: "registry", label: "Registro Mercantil (si eres sociedad)", placeholder: "Registro Mercantil de Granada, Tomo X, Folio Y, Hoja GR-Z", required: false, full: true },
  {
    key: "mapsLink",
    label: "Enlace de tu ficha en Google Maps (opcional)",
    placeholder: "https://maps.app.goo.gl/…",
    required: false,
    full: true,
    hint: "En Google Maps busca tu local → Compartir → Copiar enlace. Si lo dejas vacío, el pie busca tu nombre y dirección.",
  },
];

const EMPTY: BusinessInfo = { legalName: null, taxId: null, street: null, postalCode: null, city: null, province: null, phone: null, email: null, whatsapp: null, registry: null, mapsLink: null };

const text = (v: unknown, max = 160) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);

// Lee los datos guardados; si aún no hay, aprovecha el teléfono, el WhatsApp y
// la dirección que había en Configuración → Contacto.
export function readBusiness(settings: unknown): BusinessInfo {
  const s = (settings ?? {}) as Record<string, unknown>;
  const b = (s.business ?? {}) as Record<string, unknown>;
  const out = { ...EMPTY };
  for (const f of BUSINESS_FIELDS) out[f.key] = text(b[f.key], f.key === "registry" || f.key === "mapsLink" ? 300 : 160);
  out.mapsLink = safeMapsLink(out.mapsLink);
  if (!s.business) {
    out.phone = text(s.phone);
    out.whatsapp = text(s.whatsapp);
    out.street = text(s.address);
  }
  return out;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// NIF (8 dígitos + letra), NIE (X/Y/Z + 7 dígitos + letra) o CIF (letra + 7 dígitos + dígito/letra).
const TAX_ID = /^([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z]|[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J])$/;

export function normalizeTaxId(v: string): string {
  return v.toUpperCase().replace(/[\s.-]/g, "");
}

// Valida lo que llega del panel. Los campos obligatorios pueden quedar vacíos
// (el panel avisa), pero si se rellenan tienen que tener buen formato.
export function parseBusiness(body: unknown): BusinessInfo | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const out = { ...EMPTY };
  for (const f of BUSINESS_FIELDS) out[f.key] = text(b[f.key], f.key === "registry" || f.key === "mapsLink" ? 300 : 160);
  if (out.mapsLink) {
    const link = safeMapsLink(out.mapsLink);
    if (!link) return "El enlace de Google Maps no es válido: cópialo desde Google Maps → Compartir";
    out.mapsLink = link;
  }
  if (out.taxId) {
    out.taxId = normalizeTaxId(out.taxId);
    if (!TAX_ID.test(out.taxId)) return "El NIF / CIF no tiene un formato válido (p. ej. B12345678 o 12345678Z)";
  }
  if (out.email && !EMAIL.test(out.email)) return "El email de contacto no es válido";
  if (out.postalCode && !/^\d{5}$/.test(out.postalCode)) return "El código postal debe tener 5 números";
  for (const k of ["phone", "whatsapp"] as const) {
    if (out[k] && out[k]!.replace(/\D/g, "").length < 9) return `El ${k === "phone" ? "teléfono" : "WhatsApp"} no es válido`;
  }
  return out;
}

export function missingRequired(b: BusinessInfo): string[] {
  return BUSINESS_FIELDS.filter((f) => f.required && !b[f.key]).map((f) => f.label);
}

export function fullAddress(b: BusinessInfo): string | null {
  const line2 = [b.postalCode, b.city].filter(Boolean).join(" ");
  const parts = [b.street, line2, b.province && b.province !== b.city ? b.province : null].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

// Solo enlaces https de Google Maps (ficha del local o enlace corto de "Compartir").
const MAPS_HOSTS = ["google.com", "google.es", "maps.google.com", "maps.app.goo.gl", "goo.gl", "g.page"];
export function safeMapsLink(v: string | null): string | null {
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    const host = u.hostname.replace(/^www\./, "");
    const ok = MAPS_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) && (host !== "google.com" && host !== "google.es" ? true : u.pathname.startsWith("/maps"));
    if (!ok || (host === "goo.gl" && !u.pathname.startsWith("/maps"))) return null;
    u.protocol = "https:";
    return u.toString();
  } catch {
    return null;
  }
}

// Enlace del pie: la ficha del local si se ha pegado; si no, una búsqueda con el
// nombre del negocio y la dirección (así Google Maps abre el local, no solo la calle).
export function mapsUrl(b: BusinessInfo, brandName?: string): string | null {
  if (b.mapsLink) return b.mapsLink;
  const a = fullAddress(b);
  if (!a) return null;
  const q = brandName ? `${brandName}, ${a}` : a;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
export function whatsappHref(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d.length === 9 ? `34${d}` : d}`;
}

export const LEGAL_DOCS = [
  { slug: "aviso-legal", title: "Aviso legal" },
  { slug: "privacidad", title: "Política de privacidad" },
  { slug: "cookies", title: "Política de cookies" },
  { slug: "condiciones", title: "Condiciones de venta" },
] as const;
export type LegalSlug = (typeof LEGAL_DOCS)[number]["slug"];
