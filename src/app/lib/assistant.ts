// «Pregúntale al panel»: el dueño pregunta en lenguaje normal («¿cuánto llevo
// hoy?», «¿qué se vende menos?», «agota la cochinita») y Claude responde con
// los datos del restaurante. Claude solo LEE con estas herramientas; los
// cambios (agotar o reponer un producto) los propone y el dueño los confirma
// con un botón en el panel. Ver docs/ASISTENTE.md
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/app/lib/prisma";
import { AiError, claudeClient, toAiError } from "@/app/lib/anthropic";
import { buildReport } from "@/app/lib/reports";
import { loadReportOrders } from "@/app/lib/reportsApi";
import { readTax } from "@/app/lib/storePolicies";
import { addDays, daysBetween, startOfDayIn } from "@/app/lib/time";

const MODEL = "claude-opus-5-5";
const MAX_STEPS = 6; // vueltas de herramientas por pregunta
export const MAX_HISTORY = 12; // mensajes de la conversación que se envían
export const MAX_QUESTION_CHARS = 500;

export type ChatMessage = { role: "user" | "assistant"; text: string };
export type PendingAction = { type: "set_available"; productId: string; productName: string; available: boolean };
export type AssistantContext = { tenantId: string; tenantName: string; settings: unknown; timeZone: string; today: string; seesTakings: boolean };

// ── Periodos ────────────────────────────────────────────────────────────────
export const PERIODS = ["hoy", "ayer", "7_dias", "30_dias", "este_mes", "mes_pasado"] as const;
export type Period = (typeof PERIODS)[number];

const PERIOD_LABEL: Record<Period, string> = {
  hoy: "hoy",
  ayer: "ayer",
  "7_dias": "los últimos 7 días",
  "30_dias": "los últimos 30 días",
  este_mes: "este mes",
  mes_pasado: "el mes pasado",
};

// Días [from, to] (ambos incluidos) de un periodo, en la fecha del restaurante.
export function periodRange(period: Period, today: string): { from: string; to: string } {
  const monthStart = `${today.slice(0, 8)}01`;
  switch (period) {
    case "hoy":
      return { from: today, to: today };
    case "ayer":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "7_dias":
      return { from: addDays(today, -6), to: today };
    case "30_dias":
      return { from: addDays(today, -29), to: today };
    case "este_mes":
      return { from: monthStart, to: today };
    case "mes_pasado": {
      const lastDay = addDays(monthStart, -1);
      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay };
    }
  }
}

export const eur = (cents: number) =>
  `${(cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true })} €`;

const pct = (now: number, before: number) => (before > 0 ? `${now >= before ? "+" : ""}${Math.round(((now - before) / before) * 100)} %` : "sin datos del periodo anterior");

// ── Herramientas ────────────────────────────────────────────────────────────
const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: "object" as const, properties, required, additionalProperties: false });
const periodo = { type: "string", enum: [...PERIODS], description: "Periodo: hoy, ayer, 7_dias, 30_dias, este_mes o mes_pasado" };

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "ventas",
    description:
      "Ventas del restaurante en un periodo: total cobrado, nº de pedidos, ticket medio, cancelados, reparto por canal, los productos que más y menos venden y la comparación con el periodo anterior de la misma duración. Úsala para cualquier pregunta de ventas, caja, facturación o productos más/menos vendidos.",
    input_schema: obj({ periodo }, ["periodo"]),
    strict: true,
  },
  {
    name: "buscar_producto",
    description: "Busca productos de la carta por nombre (o parte del nombre). Devuelve id, categoría, precio y si está disponible o agotado. Úsala antes de proponer agotar o reponer un producto.",
    input_schema: obj({ texto: { type: "string", description: "Nombre o parte del nombre" } }, ["texto"]),
    strict: true,
  },
  {
    name: "productos_agotados",
    description: "Lista los productos de la carta que ahora mismo no se pueden pedir: agotados a mano o por falta de ingrediente.",
    input_schema: obj({}, []),
    strict: true,
  },
  {
    name: "stock_bajo",
    description: "Ingredientes y consumibles con control de stock que están por debajo de su mínimo o a cero.",
    input_schema: obj({}, []),
    strict: true,
  },
  {
    name: "pedidos_en_curso",
    description: "Pedidos que están ahora en marcha (nuevos, en cocina, listos, en reparto) y mesas abiertas, con el que más tiempo lleva esperando.",
    input_schema: obj({}, []),
    strict: true,
  },
  {
    name: "proponer_disponibilidad",
    description:
      "Propone al dueño agotar (disponible=false) o volver a poner a la venta (disponible=true) un producto. NO lo cambia: el panel le muestra un botón para confirmarlo. Usa el id que da buscar_producto.",
    input_schema: obj({ producto_id: { type: "string" }, disponible: { type: "boolean" } }, ["producto_id", "disponible"]),
    strict: true,
  },
];

type ToolOut = { text: string; action?: PendingAction };

async function ventas(ctx: AssistantContext, period: Period): Promise<ToolOut> {
  if (!ctx.seesTakings) return { text: "Este usuario no tiene permiso para ver lo recaudado. Dile que lo pida al gerente." };
  const { from, to } = periodRange(period, ctx.today);
  const days = daysBetween(from, to) + 1;
  const range = {
    from,
    to,
    start: startOfDayIn(ctx.timeZone, from),
    end: startOfDayIn(ctx.timeZone, addDays(to, 1)),
    prevStart: startOfDayIn(ctx.timeZone, addDays(from, -days)),
  };
  const all = await loadReportOrders(ctx.tenantId, range.prevStart, range.end);
  const r = buildReport(
    all.filter((o) => o.createdAt >= range.start),
    all.filter((o) => o.createdAt < range.start),
    range,
    ctx.timeZone,
    readTax(ctx.settings).rate
  );
  const t = r.totals;
  const p = r.previous;
  // Menos vendidos: de toda la carta activa, incluidos los que no han vendido nada.
  const active = await prisma.product.findMany({ where: { tenantId: ctx.tenantId, isActive: true, isCombo: false }, select: { name: true } });
  const sold = new Map<string, number>();
  for (const o of all) if (o.createdAt >= range.start && o.status !== "CANCELLED") for (const l of o.lines) sold.set(l.productName, (sold.get(l.productName) ?? 0) + l.quantity);
  const least = active.map((a) => ({ name: a.name, q: sold.get(a.name) ?? 0 })).sort((a, b) => a.q - b.q).slice(0, 5);
  const lines = [
    `Periodo: ${PERIOD_LABEL[period]} (${from}${from === to ? "" : ` a ${to}`}). Se compara con los ${days} día(s) anteriores.`,
    `Total cobrado: ${eur(t.revenueCents)} (antes ${eur(p.revenueCents)}, ${pct(t.revenueCents, p.revenueCents)})`,
    `Pedidos: ${t.orders} (antes ${p.orders}) · Ticket medio: ${eur(t.avgTicketCents)} · Cancelados: ${t.cancelled}`,
    `Propinas: ${eur(t.tipsCents)} · Descuentos: ${eur(t.discountCents)} · Clientes nuevos: ${t.newCustomers}`,
    `Por canal: ${r.byChannel.map((c) => `${c.channel === "DELIVERY" ? "a domicilio" : "recoger/local"} ${c.orders} pedidos, ${eur(c.revenueCents)}`).join("; ")}`,
    `Más vendidos: ${r.topProducts.slice(0, 5).map((x) => `${x.name} (${x.quantity} uds, ${eur(x.revenueCents)})`).join("; ") || "ninguno"}`,
    `Menos vendidos de la carta: ${least.map((x) => `${x.name} (${x.q} uds)`).join("; ") || "sin carta"}`,
  ];
  return { text: lines.join("\n") };
}

async function buscarProducto(ctx: AssistantContext, texto: string): Promise<ToolOut> {
  const q = texto.trim().slice(0, 60);
  if (!q) return { text: "Escribe parte del nombre." };
  const found = await prisma.product.findMany({
    where: { tenantId: ctx.tenantId, isActive: true, name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true, basePriceCents: true, isAvailable: true, stockOut: true, category: { select: { name: true } } },
    take: 8,
    orderBy: { name: "asc" },
  });
  if (!found.length) return { text: `No hay productos que contengan «${q}».` };
  return {
    text: found
      .map((p) => `id=${p.id} · ${p.name} · ${p.category?.name ?? "Sin categoría"} · ${eur(p.basePriceCents)} · ${!p.isAvailable ? "AGOTADO a mano" : p.stockOut ? "AGOTADO por falta de ingrediente" : "disponible"}`)
      .join("\n"),
  };
}

async function productosAgotados(ctx: AssistantContext): Promise<ToolOut> {
  const list = await prisma.product.findMany({
    where: { tenantId: ctx.tenantId, isActive: true, OR: [{ isAvailable: false }, { stockOut: true }] },
    select: { name: true, isAvailable: true },
    orderBy: { name: "asc" },
    take: 40,
  });
  if (!list.length) return { text: "No hay ningún producto agotado: toda la carta se puede pedir." };
  return { text: list.map((p) => `${p.name} (${p.isAvailable ? "falta un ingrediente" : "agotado a mano"})`).join("\n") };
}

const UNIT: Record<string, string> = { KG: "kg", G: "g", L: "l", ML: "ml", UNIT: "uds" };
const qty = (n: number, unit: string) => `${Math.round(n * 10) / 10} ${UNIT[unit] ?? unit.toLowerCase()}`;

async function stockBajo(ctx: AssistantContext): Promise<ToolOut> {
  const items = await prisma.ingredient.findMany({
    where: { tenantId: ctx.tenantId, isActive: true, trackStock: true },
    select: { name: true, stockQty: true, minStock: true, baseUnit: true },
  });
  const low = items.filter((i) => i.stockQty <= 0 || (i.minStock != null && i.stockQty <= i.minStock)).sort((a, b) => a.stockQty - b.stockQty);
  if (!items.length) return { text: "Ningún ingrediente tiene activado el control de stock (Costes → Inventario)." };
  if (!low.length) return { text: `Todo bien: ninguno de los ${items.length} ingredientes con control de stock está bajo mínimos.` };
  return {
    text: low
      .slice(0, 30)
      .map((i) => `${i.name}: quedan ${qty(i.stockQty, i.baseUnit)}${i.minStock != null ? ` (mínimo ${qty(i.minStock, i.baseUnit)})` : ""}`)
      .join("\n"),
  };
}

const ACTIVE = ["CREATED", "PAID", "SENT_TO_POS", "ACCEPTED", "PREPARING", "READY", "DELIVERING"] as const;
const STATUS_LABEL: Record<string, string> = {
  CREATED: "nuevos",
  PAID: "nuevos (pagados)",
  SENT_TO_POS: "enviados al TPV",
  ACCEPTED: "aceptados",
  PREPARING: "en cocina",
  READY: "listos",
  DELIVERING: "en reparto",
};

async function pedidosEnCurso(ctx: AssistantContext): Promise<ToolOut> {
  const since = new Date(Date.now() - 2 * 86_400_000);
  const [orders, open] = await Promise.all([
    prisma.order.findMany({ where: { tenantId: ctx.tenantId, status: { in: [...ACTIVE] }, createdAt: { gte: since } }, select: { status: true, createdAt: true, orderNumber: true } }),
    prisma.order.count({ where: { tenantId: ctx.tenantId, status: "OPEN" } }),
  ]);
  if (!orders.length && !open) return { text: "No hay pedidos en marcha ni mesas abiertas ahora mismo." };
  const by = new Map<string, number>();
  for (const o of orders) by.set(o.status, (by.get(o.status) ?? 0) + 1);
  const oldest = orders.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  return {
    text: [
      `Pedidos en marcha: ${orders.length}${orders.length ? ` (${[...by.entries()].map(([s, n]) => `${n} ${STATUS_LABEL[s] ?? s}`).join(", ")})` : ""}`,
      `Mesas abiertas: ${open}`,
      oldest ? `El que más lleva: pedido ${oldest.orderNumber ?? "sin número"}, hace ${Math.round((Date.now() - oldest.createdAt.getTime()) / 60000)} min` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

async function proponerDisponibilidad(ctx: AssistantContext, productId: string, available: boolean): Promise<ToolOut> {
  const p = await prisma.product.findFirst({ where: { id: productId, tenantId: ctx.tenantId }, select: { id: true, name: true, isAvailable: true } });
  if (!p) return { text: "Ese producto no existe. Búscalo antes con buscar_producto." };
  if (p.isAvailable === available) return { text: `${p.name} ya está ${available ? "a la venta" : "agotado"}; no hace falta cambiar nada.` };
  return {
    text: `Propuesta mostrada al dueño con un botón para ${available ? "volver a poner a la venta" : "agotar"} «${p.name}». Aún NO está hecho: dile que lo confirme con el botón.`,
    action: { type: "set_available", productId: p.id, productName: p.name, available },
  };
}

export async function runTool(ctx: AssistantContext, name: string, input: unknown): Promise<ToolOut> {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "ventas":
      return PERIODS.includes(i.periodo as Period) ? ventas(ctx, i.periodo as Period) : { text: "Periodo no válido." };
    case "buscar_producto":
      return buscarProducto(ctx, String(i.texto ?? ""));
    case "productos_agotados":
      return productosAgotados(ctx);
    case "stock_bajo":
      return stockBajo(ctx);
    case "pedidos_en_curso":
      return pedidosEnCurso(ctx);
    case "proponer_disponibilidad":
      return typeof i.producto_id === "string" && typeof i.disponible === "boolean"
        ? proponerDisponibilidad(ctx, i.producto_id, i.disponible)
        : { text: "Faltan datos." };
    default:
      return { text: `Herramienta desconocida: ${name}` };
  }
}

// ── Conversación ────────────────────────────────────────────────────────────
function system(ctx: AssistantContext): string {
  return `Eres el asistente del panel de NorApp del restaurante «${ctx.tenantName}». Hoy es ${ctx.today} (zona ${ctx.timeZone}).
Respondes al dueño o al encargado, que suele estar en el local con el móvil o la tablet y poco tiempo.

Reglas:
- Responde siempre en español de España, corto y claro: 1 a 4 frases o una lista breve. Nada de tecnicismos.
- Los datos SOLO salen de las herramientas. Si no tienes una herramienta para algo, dilo y sugiere dónde mirarlo en el panel (Informes, Costes, Carta, Pedidos, Clientes…). Nunca inventes cifras.
- Importes como los dan las herramientas (1.234,50 €).
- No puedes cambiar nada por tu cuenta. Para agotar o reponer un producto usa proponer_disponibilidad: el panel le mostrará un botón para confirmarlo.
- No opines sobre los precios que pone el restaurante; si te lo piden, da los datos.
- Si la pregunta no tiene que ver con el restaurante, di amablemente que solo ayudas con el panel.`;
}

export type AssistantReply = { reply: string; actions: PendingAction[] };

export async function askPanel(ctx: AssistantContext, history: ChatMessage[]): Promise<AssistantReply> {
  const client = claudeClient();
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.text }));
  const actions: PendingAction[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        // Si el modelo declina por política, la API reintenta con otro modelo adecuado.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: system(ctx),
        tools: TOOLS,
        messages,
      });
    } catch (err) {
      throw toAiError(err, "assistant");
    }

    if (response.stop_reason === "refusal") throw new AiError("La IA no puede responder a eso. Prueba a preguntarlo de otra forma.");
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !calls.length) {
      if (!text) throw new AiError("La IA no ha dado respuesta. Inténtalo de nuevo.");
      return { reply: text, actions };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      try {
        const out = await runTool(ctx, call.name, call.input);
        if (out.action && !actions.some((a) => a.productId === out.action!.productId)) actions.push(out.action);
        results.push({ type: "tool_result", tool_use_id: call.id, content: out.text });
      } catch (err) {
        console.error("[assistant] herramienta", call.name, err instanceof Error ? err.message.slice(0, 200) : err);
        results.push({ type: "tool_result", tool_use_id: call.id, content: "No se han podido leer esos datos ahora mismo.", is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  throw new AiError("La pregunta es demasiado larga de responder. Prueba a dividirla.");
}

// Limpia la conversación que manda el navegador.
export function parseHistory(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out: ChatMessage[] = [];
  for (const m of raw.slice(-MAX_HISTORY)) {
    const r = m as { role?: unknown; text?: unknown };
    if ((r.role !== "user" && r.role !== "assistant") || typeof r.text !== "string") return null;
    const text = r.text.trim().slice(0, r.role === "user" ? MAX_QUESTION_CHARS : 2000);
    if (!text) return null;
    out.push({ role: r.role, text });
  }
  // Debe empezar y terminar con el dueño, y alternar.
  while (out.length && out[0].role !== "user") out.shift();
  if (!out.length || out[out.length - 1].role !== "user") return null;
  for (let i = 1; i < out.length; i++) if (out[i].role === out[i - 1].role) return null;
  return out;
}
