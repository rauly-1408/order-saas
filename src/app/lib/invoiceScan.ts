// Lectura de albaranes y facturas de proveedor con Claude (módulo Costes, fase 4).
// La IA lee el documento, relaciona cada línea con un ingrediente del restaurante
// y convierte cantidad y precio al formato de ese ingrediente. El dueño revisa
// el resultado antes de aplicarlo (ver costs/invoice-apply).
import type { BaseUnit } from "@prisma/client";
import { AiError, claudeClient, toAiError } from "@/app/lib/anthropic";
import { sanitizeScan, type ScanIngredient, type ScanMediaType, type ScanResult, type ScanSupplier } from "@/app/lib/invoice";

const MODEL = "claude-opus-5-5";

const UNIT_TEXT: Record<BaseUnit, string> = { KG: "kg", G: "g", L: "l", ML: "ml", UNIT: "unidades" };

const SYSTEM = `Lees albaranes y facturas de proveedores de un restaurante español y los conviertes en datos para su control de costes.

Para cada línea de producto del documento:
- description: el texto de la línea tal cual (resumido si es muy largo).
- ingredientId: el id del ingrediente del restaurante que corresponde a esa línea, de la lista que te paso. Si no hay ninguno que corresponda con claridad, null. No fuerces coincidencias.
- quantity: la cantidad recibida, convertida a la UNIDAD BASE de ese ingrediente (kg, g, l, ml o unidades). Ejemplos: "2 cajas de 5 kg" con unidad base g → 10000; "3 docenas" con unidad base unidades → 36. Si no hay ingrediente, la cantidad en la unidad del documento.
- packPriceCents: el precio SIN IVA, en céntimos, de UN formato del ingrediente (el formato de compra que te indico para cada ingrediente). Ejemplo: formato 5000 g y el documento dice 2,40 €/kg → 1200. Si no hay ingrediente, null.
- lineTotalCents: el importe de la línea SIN IVA en céntimos, tal como aparece (o cantidad × precio si no aparece).
- note: solo si hay algo que el dueño deba revisar (abono, devolución, unidad dudosa, precio con IVA incluido que has descontado…). Si no, null.

Del documento: supplierId (id del proveedor de la lista si coincide, si no null), supplierName (como aparece), documentNumber, documentDate (AAAA-MM-DD) y totalCents (base imponible total sin IVA, si aparece).

Ignora líneas que no son producto (portes, envases retornables, recargos, IVA, totales). Si un precio aparece con IVA incluido, descuéntalo (normalmente 10 % en alimentación, 4 % en básicos, 21 % en otros) y avísalo en note. No inventes datos que no estén en el documento: si algo no se lee, null.`;

const nullable = (type: "string" | "integer" | "number") => ({ anyOf: [{ type }, { type: "null" }] });

const SCHEMA = {
  type: "object",
  properties: {
    supplierId: nullable("string"),
    supplierName: nullable("string"),
    documentNumber: nullable("string"),
    documentDate: nullable("string"),
    totalCents: nullable("integer"),
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          ingredientId: nullable("string"),
          quantity: nullable("number"),
          packPriceCents: nullable("integer"),
          lineTotalCents: nullable("integer"),
          note: nullable("string"),
        },
        required: ["description", "ingredientId", "quantity", "packPriceCents", "lineTotalCents", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["supplierId", "supplierName", "documentNumber", "documentDate", "totalCents", "lines"],
  additionalProperties: false,
} as const;

function catalog(ingredients: ScanIngredient[], suppliers: ScanSupplier[]): string {
  const sup = suppliers.map((s) => `- ${s.id}: ${s.name}`).join("\n") || "(ninguno)";
  const ing =
    ingredients
      .map((i) => `- ${i.id}: ${i.name} · unidad base ${UNIT_TEXT[i.baseUnit]} · formato de compra ${i.packSize} ${UNIT_TEXT[i.baseUnit]} · precio actual del formato ${(i.packPriceCents / 100).toFixed(2)} €`)
      .join("\n") || "(ninguno)";
  return `Proveedores del restaurante:\n${sup}\n\nIngredientes del restaurante:\n${ing}`;
}

export async function scanSupplierDocument(
  file: { mediaType: ScanMediaType; data: string },
  ingredients: ScanIngredient[],
  suppliers: ScanSupplier[]
): Promise<ScanResult> {
  const client = claudeClient();
  const doc =
    file.mediaType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data } } as const)
      : ({ type: "image", source: { type: "base64", media_type: file.mediaType, data: file.data } } as const);

  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [doc, { type: "text", text: `${catalog(ingredients, suppliers)}\n\nLee el documento adjunto.` }],
        },
      ],
    });
  } catch (err) {
    throw toAiError(err, "invoiceScan");
  }

  if (response.stop_reason === "refusal") throw new AiError("La IA no ha podido leer este documento.");
  if (response.stop_reason === "max_tokens") throw new AiError("El documento es demasiado largo. Prueba con una página cada vez.");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiError("La IA devolvió una respuesta inesperada. Inténtalo de nuevo.");
  }
  const result = sanitizeScan(parsed, ingredients, suppliers);
  if (!result.lines.length) throw new AiError("No he encontrado líneas de producto. ¿La foto está bien enfocada y completa?");
  return result;
}
