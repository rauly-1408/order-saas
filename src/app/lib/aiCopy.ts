// Redacción de mensajes de campaña con Claude (motor de retención, fase 2).
// El servidor arma el contexto (restaurante, grupo, cupón, platos más pedidos)
// y pide 3 versiones en JSON. Cada versión se valida antes de devolverla.
import { aiConfigured, AiError, claudeClient, toAiError } from "@/app/lib/anthropic";
import { SEGMENT_LABEL, type Segment } from "@/app/lib/retention";

const MODEL = "claude-opus-5-5";
const MAX_MESSAGE_CHARS = 600;

export { aiConfigured };

const SEGMENT_CONTEXT: Record<Segment, string> = {
  NEW: "clientes que han pedido una sola vez: el objetivo es que hagan el segundo pedido",
  REGULAR: "clientes habituales que repiten: el objetivo es agradecer y mantener la frecuencia",
  VIP: "los mejores clientes (muchos pedidos o mucho gasto): el objetivo es hacerles sentir especiales",
  AT_RISK: "clientes que pedían a menudo pero llevan más de 30 días sin pedir: el objetivo es que vuelvan",
};

export type CopyInput = {
  restaurant: string;
  segment: Segment;
  coupon: { code: string; label: string } | null;
  topDishes: string[];
  idea: string | null;
};

const SYSTEM = `Eres el redactor de mensajes de WhatsApp de un restaurante español que vende comida a domicilio y para recoger.
Escribes mensajes cortos, cercanos y naturales, como los escribiría el dueño a un cliente al que conoce. En español de España, con tuteo.

Reglas del mensaje:
- Entre 1 y 3 frases, como máximo 350 caracteres. Un emoji como mucho, o ninguno.
- Usa SIEMPRE estos marcadores literales, que el sistema sustituye después: {nombre} (nombre del cliente, al principio del saludo) y {enlace} (enlace a la carta, al final).
- Si hay cupón, usa también {cupon} (el código) y {descuento} (por ejemplo "15 %"). No escribas el código ni el porcentaje a mano.
- Si no hay cupón, no prometas descuentos ni regalos.
- Puedes mencionar uno o dos platos de los que te paso, por su nombre. No inventes platos, precios, horarios ni promociones.
- No añadas texto para darse de baja: el sistema lo añade solo.
- Nada de mayúsculas sostenidas, urgencias falsas ("¡solo hoy!") ni presión.

Devuelve tres versiones distintas entre sí (tono, enfoque o plato mencionado).`;

const SCHEMA = {
  type: "object",
  properties: {
    variants: { type: "array", items: { type: "string" } },
  },
  required: ["variants"],
  additionalProperties: false,
} as const;

function userPrompt(i: CopyInput): string {
  const lines = [
    `Restaurante: ${i.restaurant}`,
    `Destinatarios: ${SEGMENT_LABEL[i.segment]} — ${SEGMENT_CONTEXT[i.segment]}.`,
    i.coupon ? `Cupón: sí (${i.coupon.label} de descuento). Usa {cupon} y {descuento}.` : "Cupón: no.",
    i.topDishes.length ? `Platos más pedidos últimamente: ${i.topDishes.join(", ")}.` : "No hay datos de platos más pedidos.",
  ];
  if (i.idea) lines.push(`Idea del dueño para esta campaña (tenla en cuenta): ${i.idea}`);
  return lines.join("\n");
}

// Problema de una versión, o null si cumple las reglas.
export function variantProblem(text: string, hasCoupon: boolean): string | null {
  if (!text.includes("{nombre}")) return "falta {nombre}";
  if (!text.includes("{enlace}")) return "falta {enlace}";
  if (hasCoupon && !text.includes("{cupon}")) return "falta {cupon}";
  if (!hasCoupon && (text.includes("{cupon}") || text.includes("{descuento}"))) return "usa cupón sin haberlo";
  if (/\bbaja\b/i.test(text)) return "incluye texto de baja";
  if (text.length > MAX_MESSAGE_CHARS) return "demasiado largo";
  return null;
}

export { AiError as AiCopyError };

export async function draftCampaignMessages(input: CopyInput): Promise<string[]> {
  const client = claudeClient();
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // Si el modelo declina por política, la API reintenta con otro modelo adecuado.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt(input) }],
    });
  } catch (err) {
    throw toAiError(err, "aiCopy");
  }

  if (response.stop_reason === "refusal") throw new AiError("La IA no ha podido redactar este mensaje. Prueba con otra idea.");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let variants: unknown;
  try {
    variants = (JSON.parse(text) as { variants?: unknown }).variants;
  } catch {
    throw new AiError("La IA devolvió una respuesta inesperada. Inténtalo de nuevo.");
  }
  const valid = (Array.isArray(variants) ? variants : [])
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => variantProblem(v, !!input.coupon) === null);
  if (!valid.length) throw new AiError("La IA no ha dado ninguna versión válida. Inténtalo de nuevo.");
  return valid.slice(0, 3);
}
