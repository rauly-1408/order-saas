// Inventario por voz (módulo Costes): el dueño dicta «hay 3 kilos de tomate,
// entran 2 cajas de pan, se han tirado 500 g de lechuga» y la IA lo convierte en
// movimientos de stock para revisar. No guarda nada: el panel enseña las líneas,
// el dueño las corrige y las guarda con el POST normal de costs/stock.
import type { BaseUnit } from "@prisma/client";
import { AiError, claudeClient, toAiError } from "@/app/lib/anthropic";

const MODEL = "claude-opus-5-5";
export const MAX_DICTATION_CHARS = 2000;

export type VoiceIngredient = { id: string; name: string; baseUnit: BaseUnit; packSize: number };
export type VoiceType = "COUNT" | "RECEIPT" | "WASTE";
export type VoiceLine = { heard: string; ingredientId: string | null; type: VoiceType; quantity: number; note: string | null };

const UNIT_TEXT: Record<BaseUnit, string> = { KG: "kg", G: "g", L: "l", ML: "ml", UNIT: "unidades" };
const TYPES: VoiceType[] = ["COUNT", "RECEIPT", "WASTE"];

const SYSTEM = `Conviertes lo que dicta el dueño de un restaurante español en movimientos de inventario.

Para CADA producto que mencione, una línea:
- heard: lo que ha dicho de ese producto, corto (p. ej. «3 kilos de tomate»).
- ingredientId: el id del ingrediente de la lista que corresponde. Acepta plurales, diminutivos y formas habladas («tomates», «el aceite», «pan de mollete»). Si no hay ninguno claro, null. No fuerces coincidencias.
- type: "COUNT" si dice lo que HAY o le QUEDA («hay», «quedan», «tengo», o solo cantidad y producto); "RECEIPT" si ENTRA o ha llegado mercancía («entran», «han traído», «llegan», «he comprado»); "WASTE" si se ha perdido («se ha tirado», «caducado», «se ha roto», «merma»).
- quantity: la cantidad convertida a la UNIDAD BASE del ingrediente. Ejemplos: «3 kilos» con base g → 3000; «medio kilo» con base g → 500; «2 cajas» con formato de compra 5000 g → 10000; «una docena» con base unidades → 12; «litro y medio» con base ml → 1500. «Nada», «se ha acabado» o «cero» en un recuento → 0. Si no hay ingrediente, la cantidad tal como la dice.
- note: solo si el dueño debe revisar algo (unidad dudosa, «cajas» sin formato claro, cifra que no se entiende). Si no, null.

Si el texto no habla de inventario, devuelve la lista vacía. No inventes productos ni cantidades que no se hayan dicho.`;

const SCHEMA = {
  type: "object",
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heard: { type: "string" },
          ingredientId: { anyOf: [{ type: "string" }, { type: "null" }] },
          type: { type: "string", enum: TYPES },
          quantity: { type: "number" },
          note: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: ["heard", "ingredientId", "type", "quantity", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["lines"],
  additionalProperties: false,
} as const;

function catalog(ingredients: VoiceIngredient[]): string {
  return (
    ingredients.map((i) => `- ${i.id}: ${i.name} · unidad base ${UNIT_TEXT[i.baseUnit]} · formato de compra ${i.packSize} ${UNIT_TEXT[i.baseUnit]}`).join("\n") || "(ninguno)"
  );
}

// Lo que devuelve la IA se revisa: ids que no son del restaurante, cantidades
// imposibles y textos largos fuera.
export function sanitizeVoice(raw: unknown, ingredients: VoiceIngredient[]): VoiceLine[] {
  const ids = new Set(ingredients.map((i) => i.id));
  const lines = (raw as { lines?: unknown })?.lines;
  if (!Array.isArray(lines)) return [];
  return lines.slice(0, 60).flatMap((l): VoiceLine[] => {
    const x = (l ?? {}) as Record<string, unknown>;
    const type = TYPES.includes(x.type as VoiceType) ? (x.type as VoiceType) : null;
    const quantity = Number(x.quantity);
    if (!type || !Number.isFinite(quantity) || quantity < 0 || quantity > 1e7) return [];
    if (type !== "COUNT" && quantity === 0) return [];
    const heard = typeof x.heard === "string" ? x.heard.trim().slice(0, 120) : "";
    const ingredientId = typeof x.ingredientId === "string" && ids.has(x.ingredientId) ? x.ingredientId : null;
    const note = typeof x.note === "string" && x.note.trim() ? x.note.trim().slice(0, 200) : null;
    return [{ heard, ingredientId, type, quantity: Math.round(quantity * 1000) / 1000, note }];
  });
}

export async function parseStockDictation(text: string, ingredients: VoiceIngredient[]): Promise<VoiceLine[]> {
  let response;
  try {
    response = await claudeClient().beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: `Ingredientes del restaurante:\n${catalog(ingredients)}\n\nLo que ha dictado el dueño:\n«${text}»` }],
    });
  } catch (err) {
    throw toAiError(err, "voiceStock");
  }
  if (response.stop_reason === "refusal") throw new AiError("La IA no ha podido entender este dictado.");
  if (response.stop_reason === "max_tokens") throw new AiError("Es demasiado de una vez. Dicta menos productos cada vez.");
  const out = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(out);
  } catch {
    throw new AiError("La IA devolvió una respuesta inesperada. Inténtalo de nuevo.");
  }
  return sanitizeVoice(parsed, ingredients);
}
