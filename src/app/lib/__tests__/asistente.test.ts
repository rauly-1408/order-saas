import { describe, expect, it, vi, beforeEach } from "vitest";

// Claude simulado: primero pide una herramienta y luego responde con texto.
const create = vi.fn();
vi.mock("@/app/lib/anthropic", async () => {
  class AiError extends Error {}
  return { AiError, claudeClient: () => ({ beta: { messages: { create } } }), toAiError: (e: unknown) => e };
});
const product = { findFirst: vi.fn(), findMany: vi.fn() };
vi.mock("@/app/lib/prisma", () => ({ prisma: { product, ingredient: { findMany: vi.fn() }, order: { findMany: vi.fn(), count: vi.fn() } } }));
vi.mock("@/app/lib/reportsApi", () => ({ loadReportOrders: vi.fn() }));

const { periodRange, parseHistory, eur, askPanel, runTool, TOOLS } = await import("../assistant");
const { searchGuide, normalize, GUIDE } = await import("../assistantGuide");
const ctx = { tenantId: "t1", tenantName: "Demo", settings: {}, timeZone: "Europe/Madrid", today: "2026-11-20", seesTakings: true };

describe("periodos del asistente", () => {
  it("calcula hoy, ayer, 7 y 30 días", () => {
    expect(periodRange("hoy", "2026-11-20")).toEqual({ from: "2026-11-20", to: "2026-11-20" });
    expect(periodRange("ayer", "2026-03-01")).toEqual({ from: "2026-02-28", to: "2026-02-28" });
    expect(periodRange("7_dias", "2026-11-20")).toEqual({ from: "2026-11-14", to: "2026-11-20" });
    expect(periodRange("30_dias", "2026-11-20")).toEqual({ from: "2026-10-22", to: "2026-11-20" });
  });
  it("calcula este mes y el mes pasado (también en enero)", () => {
    expect(periodRange("este_mes", "2026-11-20")).toEqual({ from: "2026-11-01", to: "2026-11-20" });
    expect(periodRange("mes_pasado", "2026-11-20")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodRange("mes_pasado", "2026-01-05")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
  it("da formato a los euros", () => {
    expect(eur(123450)).toMatch(/^1\.?234,50 €$/);
  });
});

describe("conversación que llega del navegador", () => {
  it("acepta una conversación alterna que acaba con el dueño", () => {
    expect(parseHistory([{ role: "user", text: " hola " }])).toEqual([{ role: "user", text: "hola" }]);
    expect(parseHistory([{ role: "user", text: "a" }, { role: "assistant", text: "b" }, { role: "user", text: "c" }])).toHaveLength(3);
  });
  it("rechaza lo vacío, roles raros o sin pregunta al final", () => {
    expect(parseHistory([])).toBeNull();
    expect(parseHistory([{ role: "system", text: "x" }])).toBeNull();
    expect(parseHistory([{ role: "user", text: "a" }, { role: "assistant", text: "b" }])).toBeNull();
    expect(parseHistory([{ role: "user", text: "a" }, { role: "user", text: "b" }])).toBeNull();
    expect(parseHistory("hola")).toBeNull();
  });
  it("recorta preguntas largas", () => {
    expect(parseHistory([{ role: "user", text: "x".repeat(900) }])![0].text).toHaveLength(500);
  });
});

describe("herramientas", () => {
  it("todas son estrictas y sin propiedades extra", () => {
    for (const t of TOOLS) {
      expect(t.strict).toBe(true);
      expect((t.input_schema as { additionalProperties?: boolean }).additionalProperties).toBe(false);
    }
  });
});

describe("bucle con Claude", () => {
  beforeEach(() => {
    create.mockReset();
    product.findFirst.mockReset();
  });

  it("propone agotar un producto sin cambiarlo y devuelve el botón", async () => {
    product.findFirst.mockResolvedValue({ id: "p1", name: "Mollete de cochinita", isAvailable: true });
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu1", name: "proponer_disponibilidad", input: { producto_id: "p1", disponible: false } }] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "Te dejo el botón para agotarlo." }] });
    const out = await askPanel(ctx, [{ role: "user", text: "agota la cochinita" }]);
    expect(out.reply).toBe("Te dejo el botón para agotarlo.");
    expect(out.actions).toEqual([{ type: "set_available", productId: "p1", productName: "Mollete de cochinita", available: false }]);
    // La segunda llamada lleva el resultado de la herramienta.
    const second = create.mock.calls[1][0];
    expect(second.messages.at(-1).content[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu1" });
    expect(second.tools).toBe(TOOLS);
    expect(second.model).toBe("claude-opus-5-5");
    // Solo busca productos del propio restaurante.
    expect(product.findFirst.mock.calls[0][0].where).toEqual({ id: "p1", tenantId: "t1" });
  });

  it("sin permiso de recaudación no enseña ventas", async () => {
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu1", name: "ventas", input: { periodo: "hoy" } }] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "No tienes permiso." }] });
    await askPanel({ ...ctx, seesTakings: false }, [{ role: "user", text: "¿cuánto llevo?" }]);
    expect(create.mock.calls[1][0].messages.at(-1).content[0].content).toMatch(/no tiene permiso/);
  });

  it("lleva al prompt lo aprendido y se presenta como NORA", async () => {
    create.mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "Hecho." }] });
    await askPanel({ ...ctx, learned: "Lo aprendido: X" }, [{ role: "user", text: "hola" }]);
    const sys = create.mock.calls[0][0].system as string;
    expect(sys).toMatch(/Eres NORA/);
    expect(sys).toMatch(/Lo aprendido: X$/);
  });

  it("si la IA declina, da un aviso en español", async () => {
    create.mockResolvedValueOnce({ stop_reason: "refusal", content: [] });
    await expect(askPanel(ctx, [{ role: "user", text: "x" }])).rejects.toThrow(/no puede responder/);
  });
});

describe("preguntas frecuentes (como_se_hace)", () => {
  it("encuentra la entrada aunque se pregunte con otras palabras o sin tildes", () => {
    expect(searchGuide("¿Cómo pongo un producto como agotado?")[0].id).toBe("agotar");
    expect(searchGuide("como cambio el horario por vacaciones")[0].id).toBe("horario");
    expect(searchGuide("la impresora de cocina no imprime")[0].id).toBe("impresora");
    expect(searchGuide("quiero dar acceso a un camarero")[0].id).toBe("usuarios");
    expect(searchGuide("donde subo el certificado de hacienda")[0].id).toBe("facturas");
    expect(searchGuide("como hago un 2x1")[0].id).toBe("promos");
  });
  it("no se inventa nada si no hay entrada", async () => {
    expect(searchGuide("quién ganó el partido ayer")).toEqual([]);
    expect((await runTool(ctx, "como_se_hace", { pregunta: "quién ganó el partido ayer" })).text).toMatch(/No está en la guía/);
  });
  it("todas las entradas tienen id único y ruta del panel", () => {
    expect(new Set(GUIDE.map((e) => e.id)).size).toBe(GUIDE.length);
    for (const e of GUIDE) expect(e.answer.length).toBeGreaterThan(30);
  });
  it("normaliza tildes y signos", () => {
    expect(normalize("¿Cuánto   llevo HOY?")).toBe("cuanto llevo hoy");
  });
});
