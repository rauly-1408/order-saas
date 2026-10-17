// Modo prueba: una página nuestra con «Pago correcto» / «Pago rechazado» para
// probar el flujo completo sin cuenta en ninguna pasarela. No mueve dinero.
import { createHmac } from "node:crypto";
import type { Gateway } from "./types";

// Firma del resultado para que no se pueda marcar un pedido como pagado
// escribiendo la dirección a mano.
export function testToken(orderId: string, result: string): string {
  const secret = process.env.SESSION_SECRET ?? "";
  return createHmac("sha256", secret).update(`test-pay:${orderId}:${result}`).digest("hex").slice(0, 32);
}

export const testGateway: Gateway = {
  async start(order, _method, urls) {
    const page = new URL(urls.returnUrl);
    page.pathname = page.pathname.replace(/\/vuelta$/, "/prueba");
    page.search = "";
    return { kind: "redirect", url: page.toString(), ref: `test_${order.id}` };
  },
  async verify(order, params) {
    const result = params.result === "ok" ? "ok" : params.result === "ko" ? "ko" : "";
    if (!result || params.token !== testToken(order.id, result)) return { status: "PENDING" };
    return result === "ok" ? { status: "PAID", ref: `test_${order.id}` } : { status: "FAILED", message: "Pago rechazado (modo prueba)" };
  },
  async refund() {},
};
