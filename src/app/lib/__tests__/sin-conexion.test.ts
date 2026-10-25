import { beforeEach, describe, expect, it, vi } from "vitest";

// Cola sin conexión del panel (outbox.ts): guardar, reenviar en orden y no perder nada.

const store = new Map<string, string>();
const net = { online: true };
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
vi.stubGlobal("navigator", { get onLine() { return net.online; } });
vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });

const { sendOrQueue, flush, pendingList } = await import("@/app/admin/[tenant]/(panel)/outbox");

type Call = { url: string; body: Record<string, unknown> };
let calls: Call[] = [];
let reply: (c: Call) => Response | "down" = () => Response.json({ ok: true });
vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
  const c = { url, body: JSON.parse(init.body) };
  calls.push(c);
  const r = reply(c);
  if (r === "down") throw new TypeError("Failed to fetch");
  return r;
});

beforeEach(() => {
  store.clear();
  calls = [];
  net.online = true;
  reply = () => Response.json({ round: 1 });
});

describe("cola sin conexión", () => {
  it("con conexión envía al momento con requestId", async () => {
    const r = await sendOrQueue<{ round: number }>("/a", { x: 1 }, "Mesa 1");
    expect(r).toEqual({ queued: false, data: { round: 1 } });
    expect(typeof calls[0].body.requestId).toBe("string");
    expect(pendingList()).toHaveLength(0);
  });

  it("sin red lo guarda y lo reenvía al volver con el mismo requestId", async () => {
    reply = () => "down";
    const r = await sendOrQueue("/a", { x: 1 }, "Mesa 1");
    expect(r.queued).toBe(true);
    expect(pendingList()).toHaveLength(1);
    reply = () => Response.json({ round: 2 });
    expect(await flush()).toBe(1);
    expect(pendingList()).toHaveLength(0);
    const ids = calls.map((c) => c.body.requestId);
    expect(new Set(ids).size).toBe(1);
  });

  it("si el navegador sabe que no hay red, ni lo intenta", async () => {
    net.online = false;
    expect((await sendOrQueue("/a", {}, "Caja")).queued).toBe(true);
    expect(calls).toHaveLength(0);
    expect(await flush()).toBe(0);
  });

  it("con envíos en cola, el nuevo va detrás y salen en orden", async () => {
    net.online = false;
    await sendOrQueue("/a", { n: 1 }, "Ronda 1");
    net.online = true;
    reply = () => "down";
    await sendOrQueue("/a", { n: 2 }, "Ronda 2");
    reply = () => Response.json({});
    await flush();
    expect(calls.filter((c) => c.body.n).map((c) => c.body.n).slice(-2)).toEqual([1, 2]);
    expect(pendingList()).toHaveLength(0);
  });

  it("un rechazo del servidor queda marcado y no bloquea al resto", async () => {
    net.online = false;
    await sendOrQueue("/a", { n: 1 }, "Mesa 3");
    await sendOrQueue("/a", { n: 2 }, "Mesa 4");
    net.online = true;
    reply = (c) => (c.body.n === 1 ? Response.json({ error: "La mesa ya está cobrada" }, { status: 409 }) : Response.json({}));
    expect(await flush()).toBe(1);
    const left = pendingList();
    expect(left).toHaveLength(1);
    expect(left[0].error).toBe("La mesa ya está cobrada");
  });

  it("servidor caído (503) cuenta como sin conexión", async () => {
    reply = () => new Response("", { status: 503 });
    expect((await sendOrQueue("/a", {}, "Caja")).queued).toBe(true);
  });

  it("un error normal se enseña y no se guarda", async () => {
    reply = () => Response.json({ error: "Añade algo a la ronda" }, { status: 400 });
    await expect(sendOrQueue("/a", {}, "Mesa 1")).rejects.toThrow("Añade algo a la ronda");
    expect(pendingList()).toHaveLength(0);
  });
});
