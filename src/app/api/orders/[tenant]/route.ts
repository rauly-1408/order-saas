import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";
import { selectionToModifiers, validateSelection, type MenuModifierGroup } from "@/app/lib/menuOptions";
import { applyStockDeltas, orderConsumption, type ConsumptionItem } from "@/app/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// El cliente solo indica QUÉ pide; nombre y precios se toman de la base de
// datos (nunca del navegador, que se puede manipular).
type OrderLineInput = {
  productId: string;
  quantity: number;
  optionIds?: string[];
};

type OrderBody = {
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  customerPostalCode?: string;
  channel: "DELIVERY" | "TAKEAWAY";
  notes?: string;
  marketingConsent?: boolean;
  items: OrderLineInput[];
};

const ORDER_NUMBER_RETRIES = 5;
const MAX_QTY_PER_LINE = 50;
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;

// Normaliza el teléfono a una clave estable: solo dígitos (y un + inicial
// opcional). Evita que "600 123 123" y "600123123" creen dos clientes.
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
}

// Valida un teléfono español (móvil o fijo): 9 dígitos que empiezan en 6/7/8/9,
// con prefijo +34 / 0034 opcional. Última línea de defensa del CRM: aunque el
// checkout valide en cliente, un POST directo no pasa por ahí.
function isValidSpanishPhone(raw: string): boolean {
  const cleaned = raw.replace(/[\s-]/g, "");
  return /^(?:\+34|0034)?[6789]\d{8}$/.test(cleaned);
}

// Reglas de segmento. Heurística inicial — luego se puede afinar o mover a un job.
// AT_RISK gana sobre todo: un buen cliente que dejó de venir es la prioridad de retención.
const AT_RISK_DAYS = 30;

function computeSegment(
  ordersCount: number,
  totalSpentCents: number,
  lastOrderAt: Date
): "NEW" | "REGULAR" | "VIP" | "AT_RISK" {
  const daysSinceLast = (Date.now() - lastOrderAt.getTime()) / 86_400_000;

  // Si tenía historial (2+ pedidos) y lleva >30 días sin pedir → en riesgo.
  if (ordersCount >= 2 && daysSinceLast > AT_RISK_DAYS) return "AT_RISK";

  // VIP: muchos pedidos o alto gasto acumulado (≥ 150 €).
  if (ordersCount >= 6 || totalSpentCents >= 15_000) return "VIP";

  // REGULAR: ya repitió al menos una vez.
  if (ordersCount >= 2) return "REGULAR";

  return "NEW";
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const tenantSlug = segments[segments.length - 1];

    const body: OrderBody = await req.json();
    const {
      customerName,
      customerPhone,
      customerAddress,
      customerPostalCode,
      channel,
      notes,
      marketingConsent,
      items,
    } = body;

    if (!customerName?.trim() || !customerPhone?.trim() || !channel || !items?.length) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    if (!isValidSpanishPhone(customerPhone)) {
      return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
    }

    if (marketingConsent !== undefined && typeof marketingConsent !== "boolean") {
      return NextResponse.json({ error: "Consentimiento inválido" }, { status: 400 });
    }

    if (channel !== "DELIVERY" && channel !== "TAKEAWAY") {
      return NextResponse.json({ error: "Canal inválido" }, { status: 400 });
    }

    for (const item of items) {
      if (
        typeof item.productId !== "string" ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > MAX_QTY_PER_LINE ||
        (item.optionIds !== undefined &&
          (!Array.isArray(item.optionIds) || item.optionIds.some((id) => typeof id !== "string")))
      ) {
        return NextResponse.json({ error: "Item inválido" }, { status: 400 });
      }
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      include: { stores: { take: 1 } },
    });

    if (!tenant || !tenant.stores[0]) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const productIds = [...new Set(items.map((i) => i.productId))];
    const products = await prisma.product.findMany({
      where: { tenantId: tenant.id, id: { in: productIds }, isActive: true, isAvailable: true, stockOut: false },
      select: {
        id: true,
        name: true,
        basePriceCents: true,
        modifierGroups: {
          orderBy: { sortOrder: "asc" },
          select: {
            defaultOptionId: true,
            group: {
              select: {
                id: true,
                code: true,
                name: true,
                isRequired: true,
                minSelect: true,
                maxSelect: true,
                options: {
                  where: { isAvailable: true, stockOut: false },
                  orderBy: { sortOrder: "asc" },
                  select: { id: true, name: true, priceDeltaCents: true },
                },
              },
            },
          },
        },
      },
    });

    if (products.length !== productIds.length) {
      return NextResponse.json(
        { error: "Algún producto ya no está disponible. Revisa tu pedido." },
        { status: 400 }
      );
    }
    const productById = new Map(products.map((p) => [p.id, p]));

    const store = tenant.stores[0];

    if (channel === "DELIVERY" && !store.deliveryEnabled) {
      return NextResponse.json({ error: "Delivery no disponible" }, { status: 400 });
    }
    if (channel === "TAKEAWAY" && !store.takeawayEnabled) {
      return NextResponse.json({ error: "Recogida no disponible" }, { status: 400 });
    }

    // Precio de cada línea = precio base + suplementos de las opciones elegidas.
    const linesCreate: Prisma.OrderLineCreateWithoutOrderInput[] = [];
    const consumption: ConsumptionItem[] = [];
    for (const item of items) {
      const product = productById.get(item.productId)!;
      const groups: MenuModifierGroup[] = product.modifierGroups.map((pmg) => ({
        ...pmg.group,
        defaultOptionId: pmg.defaultOptionId,
      }));

      const selection: Record<string, string[]> = {};
      for (const g of groups) selection[g.id] = [];
      for (const optionId of new Set(item.optionIds ?? [])) {
        const group = groups.find((g) => g.options.some((o) => o.id === optionId));
        if (!group) {
          return NextResponse.json({ error: `${product.name}: opción no válida` }, { status: 400 });
        }
        selection[group.id].push(optionId);
      }

      const selectionError = validateSelection(groups, selection);
      if (selectionError) {
        return NextResponse.json({ error: `${product.name} — ${selectionError}` }, { status: 400 });
      }

      const modifiers = selectionToModifiers(groups, selection);
      const unitCents = product.basePriceCents + modifiers.reduce((acc, m) => acc + m.priceDeltaCents, 0);
      consumption.push({ productId: product.id, quantity: item.quantity, optionIds: Object.values(selection).flat() });
      linesCreate.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        basePriceCents: product.basePriceCents,
        modifiers: modifiers as unknown as Prisma.InputJsonValue,
        totalCents: unitCents * item.quantity,
      });
    }

    const subtotalCents = linesCreate.reduce((acc, line) => acc + (line.totalCents ?? 0), 0);
    const feesCents = channel === "DELIVERY" ? store.deliveryFeeCents : 0;
    const totalCents = subtotalCents + feesCents;
    const settings = tenant.settings as Record<string, unknown>;
    const currency = (settings?.currency as string) ?? "EUR";

    let order: Awaited<ReturnType<typeof createOrderWithNumber>> | null = null;
    let lastError: unknown;

    for (let attempt = 0; attempt < ORDER_NUMBER_RETRIES; attempt++) {
      try {
        order = await createOrderWithNumber({
          tenantId: tenant.id,
          storeId: store.id,
          channel,
          customerName,
          customerPhone,
          customerAddress: customerAddress ?? null,
          customerPostalCode: customerPostalCode ?? null,
          notes: notes ?? null,
          marketingConsent: marketingConsent === true,
          currency,
          subtotalCents,
          feesCents,
          totalCents,
          lines: linesCreate,
          // Inventario (módulo Costes): solo si el restaurante lo tiene contratado
          consumption: tenant.addons.includes("COSTS") ? consumption : [],
        });
        break;
      } catch (err) {
        lastError = err;
        const isCollision =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          (err.code === "P2002" || err.code === "P2034");
        if (!isCollision || attempt === ORDER_NUMBER_RETRIES - 1) throw err;
        await new Promise((r) => setTimeout(r, 10 + Math.random() * 30));
      }
    }

    if (!order) throw lastError ?? new Error("No se pudo crear el pedido");

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalCents: order.totalCents,
      estimatedMinutes:
        channel === "DELIVERY"
          ? store.estimatedDeliveryMinutes
          : store.estimatedPickupMinutes,
    });
  } catch (err) {
    console.error("[POST /api/orders]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

type CreateOrderInput = {
  tenantId: string;
  storeId: string;
  channel: "DELIVERY" | "TAKEAWAY";
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  customerPostalCode: string | null;
  notes: string | null;
  marketingConsent: boolean;
  currency: string;
  subtotalCents: number;
  feesCents: number;
  totalCents: number;
  lines: Prisma.OrderLineCreateWithoutOrderInput[];
  consumption: ConsumptionItem[];
};

async function createOrderWithNumber(input: CreateOrderInput) {
  return prisma.$transaction(async (tx) => {
    const orderNumberAgg = await tx.order.aggregate({
      where: { tenantId: input.tenantId },
      _max: { orderNumber: true },
    });
    const orderNumber = (orderNumberAgg._max.orderNumber ?? 0) + 1;

    // ── CRM: upsert del Customer por (tenant, teléfono) ──────────────────
    // Se hace dentro de la transacción del pedido: si el pedido falla, el
    // cliente no queda actualizado a medias.
    const phone = normalizePhone(input.customerPhone);
    const now = new Date();

    const existing = await tx.customer.findUnique({
      where: { tenantId_phone: { tenantId: input.tenantId, phone } },
      select: {
        id: true,
        ordersCount: true,
        totalSpentCents: true,
        firstOrderAt: true,
        marketingConsent: true,
      },
    });

    const newOrdersCount = (existing?.ordersCount ?? 0) + 1;
    const newTotalSpent = (existing?.totalSpentCents ?? 0) + input.totalCents;
    const segment = computeSegment(newOrdersCount, newTotalSpent, now);

    // Consentimiento: solo se CONCEDE desde el checkout (opt-in explícito).
    // Desmarcar la casilla en un pedido posterior no lo revoca — la baja va por
    // su propio flujo. marketingConsentAt guarda cuándo se dio (prueba RGPD).
    const grantConsent = input.marketingConsent && !existing?.marketingConsent;

    const customer = await tx.customer.upsert({
      where: { tenantId_phone: { tenantId: input.tenantId, phone } },
      create: {
        tenantId: input.tenantId,
        phone,
        name: input.customerName,
        ordersCount: 1,
        totalSpentCents: input.totalCents,
        firstOrderAt: now,
        lastOrderAt: now,
        segment, // será NEW en el primer pedido
        marketingConsent: input.marketingConsent,
        marketingConsentAt: input.marketingConsent ? now : null,
      },
      update: {
        // Actualizamos el nombre por si lo cambió; el teléfono es la clave estable.
        name: input.customerName,
        ordersCount: newOrdersCount,
        totalSpentCents: newTotalSpent,
        lastOrderAt: now,
        segment,
        ...(grantConsent && { marketingConsent: true, marketingConsentAt: now }),
      },
      select: { id: true },
    });

    const order = await tx.order.create({
      data: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        customerId: customer.id,
        orderNumber,
        channel: input.channel,
        status: "CREATED",
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerAddress: input.customerAddress,
        customerPostalCode: input.customerPostalCode,
        notes: input.notes,
        currency: input.currency,
        subtotalCents: input.subtotalCents,
        feesCents: input.feesCents,
        totalCents: input.totalCents,
        items: { create: input.lines },
      },
      include: { items: true },
    });

    // Descuento de stock en la misma transacción: si falla, no hay pedido.
    if (input.consumption.length) {
      const used = await orderConsumption(tx, input.tenantId, input.consumption);
      const deltas = new Map([...used].map(([id, qty]) => [id, -qty]));
      await applyStockDeltas(tx, input.tenantId, deltas, "ORDER", { orderId: order.id });
    }

    return order;
  });
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const tenantSlug = segments[segments.length - 1];

    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

    // Los pedidos contienen PII (nombre, teléfono, dirección): solo el dueño
    // autenticado de este tenant —o un SUPERADMIN— puede leerlos.
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) {
      return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    }

    const orders = await prisma.order.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ["CREATED", "ACCEPTED", "PREPARING", "READY", "DELIVERING"] },
      },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    });

    // Historial reciente (entregados/cancelados) para la sección plegada del panel.
    const since = new Date(Date.now() - HISTORY_WINDOW_MS);
    const history = await prisma.order.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ["DELIVERED", "CANCELLED"] },
        updatedAt: { gte: since },
      },
      include: { items: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    // Tiempos estimados del local: el panel colorea el temporizador de cada pedido.
    const store = await prisma.store.findFirst({
      where: { tenantId: tenant.id },
      select: { estimatedDeliveryMinutes: true, estimatedPickupMinutes: true },
    });

    return NextResponse.json({
      orders,
      history,
      estimates: {
        deliveryMinutes: store?.estimatedDeliveryMinutes ?? 45,
        pickupMinutes: store?.estimatedPickupMinutes ?? 20,
      },
    });
  } catch (err) {
    console.error("[GET /api/orders]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
