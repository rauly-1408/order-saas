// Oferta recomendada para un cliente según su historial (Clientes → ficha).
// Reglas sencillas y explicables; el resultado es un cupón que el sistema ya
// sabe aplicar (porcentaje o importe fijo con pedido mínimo). Ver docs/CLIENTES.md
import type { Segment } from "@/app/lib/retention";

export type OfferInput = {
  name: string | null;
  segment: Segment;
  orders: number;
  avgTicketCents: number;
  daysSinceLast: number | null;
  favourite: string | null;
  usualDay: string | null; // «los viernes»
  usualHour: number | null;
};
export type Offer = {
  title: string; // «10 % en su próximo pedido»
  why: string; // por qué esta oferta
  when: string | null; // cuándo mandarla
  coupon: { type: "PERCENT" | "FIXED"; value: number; minOrderCents: number; days: number };
  message: string; // texto listo para WhatsApp (sin el código)
};

const roundEuros = (cents: number) => Math.max(5, Math.round(cents / 100 / 5) * 5); // a 5 €, mínimo 5 €

export function recommendOffer(c: OfferInput): Offer {
  const first = (c.name ?? "").trim().split(/\s+/)[0] || "";
  const hi = first ? `Hola ${first.charAt(0).toUpperCase()}${first.slice(1)}` : "Hola";
  const fav = c.favourite ? ` ¿Te apetece otra vez ${c.favourite}?` : "";
  const when = c.usualDay != null && c.usualHour != null ? `Mándasela ${c.usualDay} un poco antes de las ${String(c.usualHour).padStart(2, "0")}:00, que es cuando suele pedir.` : null;

  if (c.daysSinceLast != null && c.daysSinceLast > 30) {
    return {
      title: "15 % para que vuelva",
      why: `Hace ${c.daysSinceLast} días que no pide${c.orders > 1 ? ` y antes pedía a menudo (${c.orders} pedidos)` : ""}. Un descuento claro y con fecha límite es lo que mejor funciona para recuperarlo.`,
      when,
      coupon: { type: "PERCENT", value: 15, minOrderCents: 0, days: 14 },
      message: `${hi}, te echamos de menos en ${"{restaurante}"}.${fav} Tienes un 15 % de descuento en tu próximo pedido durante 2 semanas.`,
    };
  }
  if (c.orders <= 1) {
    return {
      title: "10 % en su segundo pedido",
      why: "Ha pedido una sola vez. El segundo pedido es el que convierte a un cliente nuevo en habitual.",
      when,
      coupon: { type: "PERCENT", value: 10, minOrderCents: 0, days: 21 },
      message: `${hi}, gracias por tu primer pedido en ${"{restaurante}"}.${fav} Tienes un 10 % de descuento en el siguiente.`,
    };
  }
  if (c.segment === "VIP") {
    return {
      title: "5 € de regalo por ser de los mejores",
      why: `Es de tus mejores clientes (${c.orders} pedidos). No hace falta que pida más: un detalle de agradecimiento lo mantiene fiel.`,
      when,
      coupon: { type: "FIXED", value: 500, minOrderCents: 0, days: 30 },
      message: `${hi}, eres de nuestros mejores clientes y queremos darte las gracias: tienes 5 € de regalo en tu próximo pedido en ${"{restaurante}"}.`,
    };
  }
  // Habitual: subir un poco el ticket medio.
  const min = roundEuros(c.avgTicketCents + 500);
  return {
    title: `3 € de descuento si pide ${min} € o más`,
    why: `Repite (${c.orders} pedidos) y suele gastar unos ${Math.round(c.avgTicketCents / 100)} €. Un descuento a partir de un poco más de lo habitual hace que añada algo más al pedido.`,
    when,
    coupon: { type: "FIXED", value: 300, minOrderCents: min * 100, days: 21 },
    message: `${hi}, tienes 3 € de descuento en tu próximo pedido de ${min} € o más en ${"{restaurante}"}.${fav}`,
  };
}
