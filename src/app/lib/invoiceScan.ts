// Lectura de albaranes y facturas de proveedor con Claude (módulo Costes, fase 4).
// La IA lee el documento, relaciona cada línea con un ingrediente del restaurante
// y convierte cantidad y precio al formato de ese ingrediente. El dueño revisa
// el resultado antes de aplicarlo (ver costs/invoice-apply).
import type { BaseUnit } from "@prisma/client";
import { AiError, claudeClient, toAiError } from "@/app/lib/anthropic";
import { sanitizeScan, vatFromLines, type ScanIngredient, type ScanMediaType, type ScanResult, type ScanSupplier } from "@/app/lib/invoice";
import { ALLERGENS } from "@/app/lib/costs";

const MODEL = "claude-opus-5-5";

const UNIT_TEXT: Record<BaseUnit, string> = { KG: "kg", G: "g", L: "l", ML: "ml", UNIT: "unidades" };

const SYSTEM = `Lees albaranes y facturas de proveedores de un restaurante español y los conviertes en datos para su control de costes.

Para CADA línea con importe del documento (todas, para que la suma cuadre con el total):
- description: el texto de la línea tal cual (resumido si es muy largo).
- kind: "INGREDIENT" si es comida o bebida que se puede usar en cocina o vender; "EXPENSE" para todo lo demás (limpieza, papel, bolsas, envases, parking, portes, menaje, comida de animales, farmacia…). Las de tipo EXPENSE llevan ingredientId y newIngredient a null, y quantity y packPriceCents a null.
- docQuantity: la cantidad TAL COMO APARECE en el documento (columna «Unid.», «Cant.», kilos…), sin convertir. «1» es 1 aunque el producto sea un pack de 12.
- docUnit: la unidad del documento: "ud." si son unidades o no lo dice, "kg", "l", "caja", "saco"… tal cual.
- unitPrice: el precio por unidad del documento SIN IVA, en euros con todos sus decimales (2,4091 → 2.4091). Si el documento solo da el precio con IVA, descuéntalo.
- vatPct: el tipo de IVA de la línea (4, 10, 21…), tal como aparece; si no aparece, el que corresponda en España (4 % básicos, 10 % alimentación, 21 % lo demás) y avísalo en note.
- lineTotalWithVatCents: el importe de la línea CON IVA en céntimos (columna «Importe» o base + cuota).
- ingredientId: el id del ingrediente del restaurante que corresponde a esa línea, de la lista que te paso. Si no hay ninguno que corresponda con claridad, null. No fuerces coincidencias.
- newIngredient: SOLO si ingredientId es null, propón el ingrediente nuevo que el dueño debería dar de alta con esa línea; si ingredientId tiene valor, null. Campos: name (nombre corto en singular y con mayúscula inicial, p. ej. «Pollo entero», «Aceite de oliva»), baseUnit (G para sólidos que se pesan, KG si se compran y usan por kilos enteros, ML para líquidos pequeños, L para líquidos grandes, UNIT para piezas que se cuentan: huevos, panes, latas), packSize (el formato de compra tal como se compra, en esa unidad base: «caja de 5 kg» con base G → 5000; «garrafa 5 l» con base L → 5; «docena» con base UNIT → 12), packPriceCents (precio SIN IVA de UN formato, en céntimos) y allergens (solo los evidentes de esta lista: ${ALLERGENS.join(", ")}; si no está claro, lista vacía). En ese caso quantity va en esa unidad base.
- quantity: la cantidad recibida, convertida a la UNIDAD BASE de ese ingrediente (kg, g, l, ml o unidades). Ejemplos: "2 cajas de 5 kg" con unidad base g → 10000; "3 docenas" con unidad base unidades → 36. Si no hay ingrediente, la cantidad en la unidad del documento.
- packPriceCents: el precio SIN IVA, en céntimos, de UN formato del ingrediente (el formato de compra que te indico para cada ingrediente). Ejemplo: formato 5000 g y el documento dice 2,40 €/kg → 1200. Si no hay ingrediente, null.
- lineTotalCents: el importe de la línea SIN IVA en céntimos, tal como aparece (o cantidad × precio si no aparece).
- note: solo si hay algo que el dueño deba revisar (abono, devolución, unidad dudosa, precio con IVA incluido que has descontado…). Si no, null.

(docQuantity, docUnit, unitPrice, vatPct y lineTotalWithVatCents siempre llevan valor: si de verdad no aparece, 0 o "".)

Del documento: supplierId (id del proveedor de la lista si coincide, si no null), supplierName (como aparece), supplierTaxId (NIF/CIF del proveedor, no el del cliente), documentNumber, documentDate (AAAA-MM-DD, la fecha de la factura), totalCents (base imponible total sin IVA), vatCents (cuota total de IVA), totalWithVatCents (total a pagar) (supplierTaxId, vatCents y totalWithVatCents: "" o 0 si no aparecen) y vatBreakdown (el cuadro de IVA del documento: una fila por tipo con pct, baseCents y vatCents; si no lo trae, lista vacía).

Una factura puede agrupar varios tickets (cada uno con su subtotal): lee las líneas de todos y no repitas los subtotales como líneas. No pongas como línea los totales, subtotales ni las filas de IVA. Si un precio aparece con IVA incluido, descuéntalo (normalmente 10 % en alimentación, 4 % en básicos, 21 % en otros) y avísalo en note. No inventes datos que no estén en el documento: si algo no se lee, null.`;

const nullable = (type: "string" | "integer" | "number") => ({ anyOf: [{ type }, { type: "null" }] });

const SCHEMA = {
  type: "object",
  properties: {
    supplierId: nullable("string"),
    supplierName: nullable("string"),
    supplierTaxId: { type: "string" },
    documentNumber: nullable("string"),
    documentDate: nullable("string"),
    totalCents: nullable("integer"),
    vatCents: { type: "integer" },
    totalWithVatCents: { type: "integer" },
    vatBreakdown: {
      type: "array",
      items: {
        type: "object",
        properties: { pct: { type: "number" }, baseCents: { type: "integer" }, vatCents: { type: "integer" } },
        required: ["pct", "baseCents", "vatCents"],
        additionalProperties: false,
      },
    },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          kind: { type: "string", enum: ["INGREDIENT", "EXPENSE"] },
          docQuantity: { type: "number" },
          docUnit: { type: "string" },
          unitPrice: { type: "number" },
          vatPct: { type: "number" },
          lineTotalWithVatCents: { type: "integer" },
          ingredientId: nullable("string"),
          newIngredient: {
            anyOf: [
              {
                type: "object",
                properties: {
                  name: { type: "string" },
                  baseUnit: { type: "string", enum: ["KG", "G", "L", "ML", "UNIT"] },
                  packSize: { type: "number" },
                  packPriceCents: { type: "integer" },
                  allergens: { type: "array", items: { type: "string" } },
                },
                required: ["name", "baseUnit", "packSize", "packPriceCents", "allergens"],
                additionalProperties: false,
              },
              { type: "null" },
            ],
          },
          quantity: nullable("number"),
          packPriceCents: nullable("integer"),
          lineTotalCents: nullable("integer"),
          note: nullable("string"),
        },
        required: ["description", "kind", "docQuantity", "docUnit", "unitPrice", "vatPct", "lineTotalWithVatCents", "ingredientId", "newIngredient", "quantity", "packPriceCents", "lineTotalCents", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["supplierId", "supplierName", "supplierTaxId", "documentNumber", "documentDate", "totalCents", "vatCents", "totalWithVatCents", "vatBreakdown", "lines"],
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
    // En directo (stream): con facturas largas la respuesta puede pasar de 16 000 tokens.
    response = await client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000, // facturas con muchas líneas (varios tickets agrupados)
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
    }).finalMessage();
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
  if (!result.vatBreakdown.length) result.vatBreakdown = vatFromLines(result.lines);
  return result;
}
