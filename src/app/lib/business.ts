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
];

const EMPTY: BusinessInfo = { legalName: null, taxId: null, street: null, postalCode: null, city: null, province: null, phone: null, email: null, whatsapp: null, registry: null };

const text = (v: unknown, max = 160) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);

// Lee los datos guardados; si aún no hay, aprovecha el teléfono, el WhatsApp y
// la dirección que había en Configuración → Contacto.
export function readBusiness(settings: unknown): BusinessInfo {
  const s = (settings ?? {}) as Record<string, unknown>;
  const b = (s.business ?? {}) as Record<string, unknown>;
  const out = { ...EMPTY };
  for (const f of BUSINESS_FIELDS) out[f.key] = text(b[f.key], f.key === "registry" ? 240 : 160);
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
  for (const f of BUSINESS_FIELDS) out[f.key] = text(b[f.key], f.key === "registry" ? 240 : 160);
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

export function mapsUrl(b: BusinessInfo): string | null {
  const a = fullAddress(b);
  return a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` : null;
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
