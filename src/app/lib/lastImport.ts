// Importar fotos, alérgenos y sellos desde una tienda de Last.app (xxx.last.shop).
// La página trae todos los datos en <script id="__NUXT_DATA__">: un JSON plano
// en el que cada objeto apunta por índice a sus valores. Funciones puras (sin
// red ni Prisma) para poder probarlas. Ver docs/IMPORTAR-LAST.md
import type { DietTag } from "./diet";

export type LastProduct = { name: string; description: string; priceCents: number; imageId: string | null; allergens: string[]; diet: DietTag[] };

// Códigos de Last → los 14 alérgenos oficiales (lib/costs.ts → ALLERGENS).
const ALLERGEN_CODES: Record<string, string> = {
  gluten: "Gluten", crustaceans: "Crustáceos", eggs: "Huevos", fish: "Pescado", peanuts: "Cacahuetes", soy: "Soja", milk: "Lácteos",
  "tree-nuts": "Frutos de cáscara", celery: "Apio", mustard: "Mostaza", sesame: "Sésamo", sulfites: "Sulfitos", lupin: "Altramuces", molluscs: "Moluscos",
};
const DIET_CODES: Record<string, DietTag> = { vegan: "VEGAN", vegetarian: "VEGETARIAN", glutenfree: "GLUTEN_FREE" };

// Solo tiendas de Last.app por https.
export function lastStoreUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" && /^[a-z0-9-]+\.last\.shop$/i.test(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

// Foto cuadrada de 1000 px en JPG (cabe de sobra en el límite de 1,5 MB).
export const lastImageUrl = (imageId: string) => `https://res.cloudinary.com/lastpos/image/upload/f_jpg,q_82,w_1000,h_1000,c_fill/${encodeURIComponent(imageId)}`;

const WRAPPERS = new Set(["ShallowReactive", "Reactive", "Ref", "ShallowRef", "EmptyRef", "EmptyShallowRef", "NuxtError"]);

export function parseLastStore(html: string): LastProduct[] {
  const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  let arr: unknown[];
  try {
    arr = JSON.parse(m[1]);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const memo = new Map<number, unknown>();
  const resolve = (i: unknown, depth = 0): unknown => {
    if (typeof i !== "number" || depth > 60) return i;
    if (memo.has(i)) return memo.get(i);
    const v = arr[i];
    if (Array.isArray(v)) {
      if (typeof v[0] === "string" && WRAPPERS.has(v[0])) {
        const out = resolve(v[1], depth + 1);
        memo.set(i, out);
        return out;
      }
      if (v[0] === "Set" || v[0] === "Map") return [];
      const out: unknown[] = [];
      memo.set(i, out);
      for (const x of v) out.push(resolve(x, depth + 1));
      return out;
    }
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      memo.set(i, out);
      for (const [k, x] of Object.entries(v)) out[k] = resolve(x, depth + 1);
      return out;
    }
    memo.set(i, v);
    return v;
  };

  // Recorre todo y se queda con los productos (uno por nombre).
  const byName = new Map<string, LastProduct>();
  const seen = new Set<unknown>();
  const walk = (o: unknown, depth: number) => {
    if (!o || typeof o !== "object" || seen.has(o) || depth > 60) return;
    seen.add(o);
    const p = o as Record<string, unknown>;
    if (!Array.isArray(o) && p.itemType === "product" && typeof p.name === "string" && Array.isArray(p.allergens)) {
      const name = p.name.replace(/\s+/g, " ").trim();
      if (name && !byName.has(name)) {
        byName.set(name, {
          name,
          description: typeof p.description === "string" ? p.description.trim() : "",
          priceCents: typeof p.price === "number" ? p.price : 0,
          imageId: typeof p.imageId === "string" && /^[A-Za-z0-9_-]{4,100}$/.test(p.imageId) ? p.imageId : null,
          allergens: [...new Set((p.allergens as unknown[]).map((a) => ALLERGEN_CODES[String(a)]).filter((a): a is string => !!a))],
          diet: [...new Set((Array.isArray(p.specifications) ? p.specifications : []).map((s) => DIET_CODES[String(s)]).filter((d): d is DietTag => !!d))],
        });
      }
    }
    for (const v of Object.values(o)) walk(v, depth + 1);
  };
  walk(resolve(0), 0);
  return [...byName.values()];
}

// Palabras que no distinguen un producto de otro.
const STOP = new Set(["de", "del", "la", "el", "los", "las", "y", "con", "en", "a", "al", "ud", "uds", "unidad", "unidades", "porcion"]);

// Nombre comparable: sin tildes, comillas ni coletillas («Genil -Estilo pollo» → «genil»).
// Se guardan las cantidades («(6 uds)» → «6») para no cruzar el de 6 con el de 12.
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s[-–—].*$/, "")
    .replace(/(\d+)\s*(uds?|unidades)\b/g, " $1 ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .join(" ");
}

function score(a: string, b: string): number {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  if (ka.replace(/ /g, "") === kb.replace(/ /g, "")) return 0.95; // «Tafetén» ↔ «Ta Fetén»
  const ta = new Set(ka.split(" "));
  const tb = new Set(kb.split(" "));
  const common = [...ta].filter((t) => tb.has(t)).length;
  if (!common) return 0;
  const jaccard = common / new Set([...ta, ...tb]).size;
  // Todas las palabras del nombre corto están en el largo («Agua grande» ↔ «Agua mineral grande»);
  // entre varios así, gana el que más se parece.
  const short = ta.size <= tb.size ? ta : tb;
  if (common === short.size && [...short].join("").length >= 4) return 0.8 + 0.15 * jaccard;
  return jaccard;
}

// Empareja cada producto nuestro con el de Last que más se parece (sin repetir).
export function matchProducts<T extends { id: string; name: string }>(ours: T[], theirs: LastProduct[], min = 0.6): { product: T; last: LastProduct; score: number }[] {
  const pairs: { product: T; last: LastProduct; score: number }[] = [];
  for (const product of ours) for (const last of theirs) {
    const s = score(product.name, last.name);
    if (s >= min) pairs.push({ product, last, score: s });
  }
  pairs.sort((a, b) => b.score - a.score);
  const usedOurs = new Set<string>();
  const usedTheirs = new Set<string>();
  const out: typeof pairs = [];
  for (const p of pairs) {
    if (usedOurs.has(p.product.id) || usedTheirs.has(p.last.name)) continue;
    usedOurs.add(p.product.id);
    usedTheirs.add(p.last.name);
    out.push(p);
  }
  return out;
}
