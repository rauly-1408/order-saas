// Traducción de la carta al inglés (Carta → Idiomas). Reúne todos los textos
// que ve el cliente (categorías, productos, opciones, pasos de menú,
// promociones y tarjeta de sellos), los traduce con Claude y los guarda en el
// campo `translations.en` de cada fila. El dueño puede corregirlos a mano.
// Ver docs/CARTA-IDIOMAS.md
import { prisma } from "@/app/lib/prisma";
import { AiError, claudeClient, toAiError } from "@/app/lib/anthropic";
import { parseSlots } from "@/app/lib/promotions";

const MODEL = "claude-opus-5-5";

export type TextKind = "category" | "product" | "group" | "option" | "slot" | "promotion" | "loyalty";
export type MenuText = { ref: string; kind: TextKind; field: string; es: string; en: string | null; context?: string };

export const KIND_LABEL: Record<TextKind, string> = {
  category: "Categorías",
  product: "Productos",
  group: "Grupos de opciones",
  option: "Opciones",
  slot: "Pasos de los menús",
  promotion: "Promociones",
  loyalty: "Tarjeta de sellos",
};

const enOf = (t: unknown, field: string): string | null => {
  const v = (t as { en?: Record<string, string> } | null)?.en?.[field];
  return typeof v === "string" && v.trim() ? v : null;
};

// Todos los textos traducibles del restaurante, con su traducción actual.
export async function collectMenuTexts(tenantId: string): Promise<MenuText[]> {
  const [cats, products, groups, options, slots, promos, loyalty] = await Promise.all([
    prisma.category.findMany({ where: { tenantId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, description: true, translations: true } }),
    prisma.product.findMany({ where: { tenantId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, description: true, translations: true, category: { select: { name: true } } } }),
    prisma.modifierGroup.findMany({ where: { tenantId }, select: { id: true, name: true, translations: true } }),
    prisma.modifierOption.findMany({ where: { group: { tenantId } }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, translations: true, group: { select: { name: true } } } }),
    prisma.comboSlot.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, translations: true } }),
    prisma.promotion.findMany({ where: { tenantId }, select: { id: true, name: true, translations: true } }),
    prisma.loyaltyProgram.findUnique({ where: { tenantId }, select: { id: true, rewardName: true, rewardSlots: true, translations: true } }),
  ]);
  const out: MenuText[] = [];
  const push = (kind: TextKind, id: string, field: string, es: string | null, t: unknown, context?: string) => {
    if (es && es.trim()) out.push({ ref: `${kind}:${id}`, kind, field, es: es.trim(), en: enOf(t, field), context });
  };
  for (const c of cats) {
    push("category", c.id, "name", c.name, c.translations);
    push("category", c.id, "description", c.description, c.translations);
  }
  for (const p of products) {
    push("product", p.id, "name", p.name, p.translations, p.category.name);
    push("product", p.id, "description", p.description, p.translations, p.name);
  }
  for (const g of groups) push("group", g.id, "name", g.name, g.translations);
  for (const o of options) push("option", o.id, "name", o.name, o.translations, o.group.name);
  for (const s of slots) push("slot", s.id, "name", s.name, s.translations);
  for (const p of promos) push("promotion", p.id, "name", p.name, p.translations);
  if (loyalty) {
    push("loyalty", loyalty.id, "rewardName", loyalty.rewardName, loyalty.translations);
    parseSlots(loyalty.rewardSlots).forEach((s, i) => push("loyalty", loyalty.id, `slot${i}`, s.label, loyalty.translations));
  }
  return out;
}

// Guarda traducciones { ref, field, en } (en vacío = se borra y se usa el español).
export async function saveTranslations(tenantId: string, items: { ref: string; field: string; en: string | null }[]): Promise<number> {
  const byRef = new Map<string, { field: string; en: string | null }[]>();
  for (const it of items) byRef.set(it.ref, [...(byRef.get(it.ref) ?? []), it]);
  let saved = 0;
  for (const [ref, fields] of byRef) {
    const [kind, id] = ref.split(":") as [TextKind, string];
    const delegate = {
      category: prisma.category,
      product: prisma.product,
      group: prisma.modifierGroup,
      option: prisma.modifierOption,
      slot: prisma.comboSlot,
      promotion: prisma.promotion,
      loyalty: prisma.loyaltyProgram,
    }[kind] as unknown as {
      findFirst: (a: unknown) => Promise<{ translations: unknown } | null>;
      update: (a: unknown) => Promise<unknown>;
    };
    if (!delegate || !id) continue;
    // Solo filas de este restaurante.
    const where = kind === "option" ? { id, group: { tenantId } } : { id, tenantId };
    const row = await delegate.findFirst({ where, select: { translations: true } });
    if (!row) continue;
    const current = (row.translations ?? {}) as Record<string, Record<string, string>>;
    const en = { ...(current.en ?? {}) };
    for (const f of fields) {
      const v = f.en?.trim().slice(0, 600);
      if (v) en[f.field] = v;
      else delete en[f.field];
    }
    await delegate.update({ where: { id }, data: { translations: { ...current, en } } });
    saved += fields.length;
  }
  return saved;
}

const SYSTEM = `Eres traductor de cartas de restaurante de español a inglés para turistas.
Reglas:
- Traduce de forma natural y apetecible, como en la carta de un buen restaurante en inglés.
- Los nombres propios de platos (nombres de barrios, lugares o personas, p. ej. "Genil", "Alhambra", "Sacromonte") NO se traducen.
- Palabras típicas sin equivalente exacto (mollete, pionono, salmorejo…) se mantienen tal cual, sin aclaraciones entre paréntesis.
- "Mollete" nunca se traduce como "sandwich", "roll" ni "bun". Si la carta es de molletes, "bocadillo" también se traduce como "mollete".
- Usa siempre la misma traducción para el mismo plato, aparezca como producto o como opción (p. ej. "Ración de patatas Tafetén" → "Tafetén fries" en los dos sitios).
- Mantén cantidades, unidades, marcas y siglas tal cual (12 uds. → 12 pcs.).
- Respeta mayúsculas y estilo del original (títulos cortos siguen cortos).
- Devuelve exactamente un elemento por cada id recibido.`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: { type: "object", properties: { id: { type: "string" }, en: { type: "string" } }, required: ["id", "en"], additionalProperties: false },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

// Traduce con Claude los textos indicados. Devuelve id → traducción.
export async function translateWithAi(texts: MenuText[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const client = claudeClient();
  // Lotes moderados para respuestas rápidas y fiables.
  for (let i = 0; i < texts.length; i += 120) {
    const batch = texts.slice(i, i + 120);
    const payload = batch.map((t, j) => ({ id: String(j), text: t.es, ...(t.context && { context: t.context }) }));
    let response;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: "user", content: `Traduce al inglés estos textos de la carta (el campo "context" solo es orientativo, no lo traduzcas):\n${JSON.stringify(payload)}` }],
      });
    } catch (err) {
      throw toAiError(err, "menuTranslate");
    }
    if (response.stop_reason === "refusal") throw new AiError("La IA no ha podido traducir la carta. Inténtalo de nuevo.");
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let items: unknown;
    try {
      items = (JSON.parse(text) as { items?: unknown }).items;
    } catch {
      throw new AiError("La IA devolvió una respuesta inesperada. Inténtalo de nuevo.");
    }
    for (const it of Array.isArray(items) ? items : []) {
      const r = it as { id?: unknown; en?: unknown };
      const idx = Number(r.id);
      if (Number.isInteger(idx) && batch[idx] && typeof r.en === "string" && r.en.trim()) out.set(`${batch[idx].ref}|${batch[idx].field}`, r.en.trim().slice(0, 600));
    }
  }
  return out;
}
