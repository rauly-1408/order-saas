import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/prisma", () => ({ prisma: {} }));
const { parseSubscription } = await import("../push");

describe("avisos en el móvil", () => {
  const ok = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BNc…", auth: "xyz" } };
  it("acepta la suscripción que manda el navegador", () => {
    expect(parseSubscription(ok)).toEqual(ok);
  });
  it("rechaza lo que no es una suscripción válida", () => {
    expect(parseSubscription(null)).toBeNull();
    expect(parseSubscription({ ...ok, endpoint: "http://inseguro" })).toBeNull();
    expect(parseSubscription({ endpoint: ok.endpoint })).toBeNull();
    expect(parseSubscription({ ...ok, keys: { p256dh: 1, auth: "x" } })).toBeNull();
  });
});
