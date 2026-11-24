// Enlaces de NORA: convierte las rutas que escribe («Carta → Productos»,
// «Configuración → Impresoras») en enlaces a esa pantalla y pestaña. Solo se
// enlazan apartados que existen (lista de aquí abajo): NORA no puede inventarse
// direcciones. Las pestañas se abren con ?tab= (ver useTabFromUrl.ts).
import { CONFIG_SECTIONS } from "./configuracion/sections";

export const TAB_EVENT = "norapp:tab";

// Secciones del manual (docs/manual/<slug>.md), en el orden del menú. Si se
// añade un archivo al manual, se añade aquí. Ver docs/MANUAL.md
export const MANUAL_SECTIONS: [slug: string, title: string][] = [
  ["panel", "Uso general del panel"],
  ["inicio", "Inicio"],
  ["caja", "Caja"],
  ["pedidos", "Pedidos"],
  ["mesas", "Mesas"],
  ["reservas", "Reservas"],
  ["cocina", "Pantalla de cocina"],
  ["facturas", "Facturas"],
  ["carta", "Carta"],
  ["archivos", "Archivos"],
  ["clientes", "Clientes"],
  ["colaboradores", "Colaboradores"],
  ["informes", "Informes"],
  ["costes", "Costes"],
  ["configuracion", "Configuración"],
  ["personalizacion", "Personalización"],
  ["tienda", "Tu tienda online"],
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Apartados del menú: cómo se llaman y su dirección.
const TOP: [string, string][] = [
  ["Inicio", "home"],
  ["Caja", "caja"],
  ["Pedidos", "pedidos"],
  ["Mesas", "mesas"],
  ["Reservas", "reservas"],
  ["Pantalla de cocina", "cocina"],
  ["Facturas", "facturas"],
  ["Carta", "carta"],
  ["Archivos", "archivos"],
  ["Clientes", "clientes"],
  ["Colaboradores", "colaboradores"],
  ["Informes", "informes"],
  ["Costes", "costes"],
  ["Configuración", "configuracion"],
  ["Personalización", "configuracion/marca"], // pasó a Configuración → Marca
  ["Ayuda", "ayuda"],
  ["Manual", "ayuda"],
];

// Pestañas o subapartados de cada uno: nombre → «?tab=x» o «/subruta».
const SUB: Record<string, [string, string][]> = {
  carta: [
    ["Productos", "?tab=productos"],
    ["Opciones", "?tab=opciones"],
    ["Combos y menús", "?tab=combos"],
    ["Combos", "?tab=combos"],
    ["Cartas delivery", "?tab=delivery"],
    ["Delivery", "?tab=delivery"],
  ],
  clientes: [
    ["Clientes", "?tab=clientes"],
    ["Campañas", "?tab=campanas"],
    ["Cupones", "?tab=cupones"],
    ["Promociones", "?tab=promociones"],
    ["Fidelización", "?tab=fidelizacion"],
    ["Reseñas", "?tab=resenas"],
  ],
  costes: [
    ["Rentabilidad", "?tab=rentabilidad"],
    ["Previsión", "?tab=prevision"],
    ["Inventario", "?tab=inventario"],
    ["Compras", "?tab=compras"],
    ["Informes", "?tab=informes"],
    ["Escandallos", "?tab=escandallos"],
    ["Elaboraciones", "?tab=elaboraciones"],
    ["Ingredientes", "?tab=ingredientes"],
    ["Consumibles", "?tab=consumibles"],
    ["Proveedores", "?tab=proveedores"],
  ],
  ayuda: MANUAL_SECTIONS.map(([slug, title]) => [title, `#${slug}`] as [string, string]),
  configuracion: [...CONFIG_SECTIONS.map((s) => [s.label, `/${s.slug}`] as [string, string]), ["Facturación", "/facturacion"], ["VeriFactu", "/facturacion"], ["Horario", "/horario"], ["Usuarios", "/usuarios"]],
};

// Palabras de delante que no son un apartado («Menú → Caja», «Día a día → Reservas»).
const SKIP = new Set(["menu", "dia a dia", "panel", "tu carta", "numeros", "menu lateral"]);

export type PanelRoute = { href: string; tab?: string };

// «Carta → Productos» → /admin/demo/carta?tab=productos (o null si no existe).
export function resolveRoute(text: string, tenant: string): PanelRoute | null {
  const parts = text
    .split(/→|->|›/)
    .map(norm)
    .filter(Boolean);
  while (parts.length && SKIP.has(parts[0])) parts.shift();
  if (!parts.length) return null;
  const top = TOP.find(([l]) => norm(l) === parts[0]);
  if (!top) return null;
  const base = `/admin/${tenant}/${top[1]}`;
  const sub = parts[1] && SUB[top[1]]?.find(([l]) => {
    const n = norm(l);
    return n === parts[1] || (Math.min(n.length, parts[1].length) >= 5 && (n.startsWith(parts[1]) || parts[1].startsWith(n)));
  });
  if (!sub) return { href: base };
  const tab = sub[1].startsWith("?tab=") ? sub[1].slice(5) : undefined;
  return { href: base + sub[1], tab };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const alt = (labels: string[]) => [...new Set(labels)].sort((a, b) => b.length - a.length).map(esc).join("|");
const SUB_LABELS = Object.values(SUB).flatMap((l) => l.map(([x]) => x));
// Ruta escrita en texto normal: un apartado → una pestaña (con «Menú →» delante o no).
const CHAIN = new RegExp(`(?:(?:Menú|Día a día)\\s*→\\s*)?(?:${alt(TOP.map(([l]) => l))})\\s*→\\s*(?:${alt(SUB_LABELS)})(?![\\p{L}\\p{N}])`, "giu");

export type Piece = { text: string; route?: PanelRoute };

// Trocea un texto: los tramos que son rutas del panel llevan su enlace.
// Un tramo en negrita entero («**Costes → Inventario**», «**Caja**») cuenta
// como ruta si existe; en texto normal solo «Apartado → pestaña».
export function splitRoutes(text: string, tenant: string, wholeIsBold = false): Piece[] {
  if (wholeIsBold) {
    const r = resolveRoute(text, tenant);
    if (r && /^[\p{L}\s·→>-]+$/u.test(text.trim())) return [{ text, route: r }];
  }
  const out: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(CHAIN)) {
    const r = resolveRoute(m[0], tenant);
    if (!r) continue;
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], route: r });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
