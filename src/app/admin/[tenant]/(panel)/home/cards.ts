import { prisma } from "@/app/lib/prisma";
import { parseOnline } from "@/app/lib/brand";
import { missingRequired, readBusiness } from "@/app/lib/business";
import { readCheckout } from "@/app/lib/storePolicies";

// Tarjetas del Inicio al estilo Shopify: ideas para personalizar la tienda.
// Solo salen las que aún no están hechas, con cifras reales del restaurante.
// Ver docs/INICIO.md

export type CardArt = "business" | "brand" | "payments" | "photos" | "english" | "delivery" | "combos" | "loyalty" | "promo" | "giftcard" | "domain" | "team" | "tips" | "reviews";

export type GrowthCard = {
  id: string;
  art: CardArt;
  title: string;
  text: string;
  cta: string;
  href: string;
};

export type Insight = {
  name: string;
  units: number; // vendidos en los últimos 7 días
  growthPct: number | null; // frente a los 7 días anteriores (null = sin ventas antes)
  daily: { label: string; units: number }[];
};

export async function homeCards(tenantId: string, slug: string, timeZone: string) {
  const since = new Date(Date.now() - 14 * 86_400_000);
  const [tenant, payment, courier, noPhoto, combos, loyalty, promos, giftCards, users, lines] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true, branding: true, domains: true } }),
    prisma.paymentAccount.findUnique({ where: { tenantId }, select: { provider: true } }),
    prisma.courierAccount.findUnique({ where: { tenantId }, select: { provider: true } }),
    prisma.product.count({ where: { tenantId, isActive: true, isCombo: false, imageUrl: null } }),
    prisma.product.count({ where: { tenantId, isActive: true, isCombo: true } }),
    prisma.loyaltyProgram.findUnique({ where: { tenantId }, select: { active: true } }),
    prisma.promotion.count({ where: { tenantId, active: true } }),
    prisma.giftCard.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId, active: true } }),
    prisma.orderLine.findMany({
      where: { order: { tenantId, createdAt: { gte: since }, status: { notIn: ["CANCELLED", "AWAITING_PAYMENT"] } } },
      select: { productName: true, quantity: true, order: { select: { createdAt: true } } },
    }),
  ]);

  const settings = tenant?.settings ?? {};
  const branding = (tenant?.branding ?? {}) as Record<string, unknown>;
  const languages = (settings as Record<string, unknown>).languages;
  const base = `/admin/${slug}`;
  const cfg = (s: string) => `${base}/configuracion/${s}`;
  const missing = missingRequired(readBusiness(settings));

  // Orden = prioridad: lo que más ayuda a vender primero.
  const all: (GrowthCard & { done: boolean })[] = [
    {
      id: "negocio",
      art: "business",
      done: missing.length === 0,
      title: "Completa los datos de tu negocio",
      text: `Faltan: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}. Salen en tus políticas, tickets y en la tienda.`,
      cta: "Completar datos",
      href: cfg("negocio"),
    },
    {
      id: "pagos",
      art: "payments",
      done: !!payment && payment.provider !== "NONE",
      title: "Cobra online con tarjeta y Bizum",
      text: "Elige tu pasarela (Stripe o la de tu banco con Redsys) y tus clientes pagan al hacer el pedido.",
      cta: "Activar pagos",
      href: cfg("pagos"),
    },
    {
      id: "marca",
      art: "brand",
      done: typeof branding.logoUrl === "string" && !!branding.logoUrl,
      title: "Haz que la tienda se vea como tu local",
      text: "Sube tu logo, una foto de cabecera y elige tus colores y tipografías.",
      cta: "Personalizar marca",
      href: cfg("marca"),
    },
    {
      id: "fotos",
      art: "photos",
      done: noPhoto === 0,
      title: `${noPhoto} ${noPhoto === 1 ? "producto está" : "productos están"} sin foto`,
      text: "Los platos con foto se piden más. Súbelas desde el móvil y se ajustan solas.",
      cta: "Añadir fotos",
      href: `${base}/carta`,
    },
    {
      id: "combos",
      art: "combos",
      done: combos > 0,
      title: "Crea menús a precio cerrado",
      text: "Mollete + bebida + complemento por un precio: subes el ticket medio sin esfuerzo.",
      cta: "Crear un menú",
      href: `${base}/carta`,
    },
    {
      id: "fidelizacion",
      art: "loyalty",
      done: !!loyalty?.active,
      title: "Premia a los que repiten",
      text: "Activa una tarjeta de sellos (por ejemplo, regalo al 5º pedido). Se cuenta sola con cada pedido.",
      cta: "Crear tarjeta de sellos",
      href: `${base}/clientes`,
    },
    {
      id: "idiomas",
      art: "english",
      done: Array.isArray(languages) && languages.includes("en"),
      title: "Tu carta también en inglés",
      text: "Los turistas ven la tienda en inglés y la traducción se hace sola.",
      cta: "Activar inglés",
      href: cfg("idiomas"),
    },
    {
      id: "entrega",
      art: "delivery",
      done: !!courier && courier.provider !== "NONE",
      title: "Reparte sin tener repartidor",
      text: "Conecta Glovo y, al aceptar un pedido, se pide el repartidor automáticamente.",
      cta: "Configurar reparto",
      href: cfg("entrega"),
    },
    {
      id: "promociones",
      art: "promo",
      done: promos > 0,
      title: "Lanza una promoción",
      text: "Un 10 % los martes, envío gratis desde 20 € o descuento en el primer pedido.",
      cta: "Crear promoción",
      href: `${base}/clientes`,
    },
    {
      id: "propinas",
      art: "tips",
      done: readCheckout(settings).tips.enabled,
      title: "Deja que tus clientes den propina",
      text: "Al pagar, eligen un 5, 10 o 15 %. Lo ves separado en los informes.",
      cta: "Activar propinas",
      href: cfg("pantalla-de-pago"),
    },
    {
      id: "resenas",
      art: "reviews",
      done: !!parseOnline(branding.online).reviewsUrl,
      title: "Consigue más reseñas en Google",
      text: "Pon tu enlace de reseñas y se lo ofrecemos al cliente cuando valora su pedido.",
      cta: "Añadir enlace",
      href: cfg("marca"),
    },
    {
      id: "tarjetas-regalo",
      art: "giftcard",
      done: giftCards > 0,
      title: "Vende tarjetas regalo",
      text: "Crea un código con saldo para regalar; se descuenta solo al pagar.",
      cta: "Crear tarjeta regalo",
      href: cfg("tarjetas-regalo"),
    },
    {
      id: "usuarios",
      art: "team",
      done: users > 1,
      title: "Añade a tu equipo",
      text: "Tu cocina ve y gestiona los pedidos con su propio acceso, sin ver tus ingresos.",
      cta: "Invitar a alguien",
      href: cfg("usuarios"),
    },
    {
      id: "dominio",
      art: "domain",
      done: (tenant?.domains.length ?? 0) > 0,
      title: "Tu tienda con tu propio dominio",
      text: "pedidos.turestaurante.com en lugar de nuestro enlace, con instrucciones paso a paso.",
      cta: "Conectar dominio",
      href: cfg("dominios"),
    },
  ];

  const cards: GrowthCard[] = all.filter((c) => !c.done);
  return { cards, total: all.length, insight: topProduct(lines, timeZone) };
}

// Producto más vendido en los últimos 7 días, con su evolución diaria.
function topProduct(lines: { productName: string; quantity: number; order: { createdAt: Date } }[], timeZone: string): Insight | null {
  const now = Date.now();
  const week = now - 7 * 86_400_000;
  const units = new Map<string, number>();
  const before = new Map<string, number>();
  for (const l of lines) {
    const map = l.order.createdAt.getTime() >= week ? units : before;
    map.set(l.productName, (map.get(l.productName) ?? 0) + l.quantity);
  }
  const top = [...units.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const [name, total] = top;
  const prev = before.get(name) ?? 0;

  const day = new Intl.DateTimeFormat("es-ES", { weekday: "short", timeZone });
  const key = new Intl.DateTimeFormat("en-CA", { timeZone });
  const daily = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now - (6 - i) * 86_400_000);
    return { key: key.format(d), label: day.format(d).replace(".", ""), units: 0 };
  });
  for (const l of lines) {
    if (l.productName !== name || l.order.createdAt.getTime() < week) continue;
    const slot = daily.find((d) => d.key === key.format(l.order.createdAt));
    if (slot) slot.units += l.quantity;
  }
  return {
    name,
    units: total,
    growthPct: prev > 0 ? Math.round(((total - prev) / prev) * 100) : null,
    daily: daily.map(({ label, units }) => ({ label, units })),
  };
}
