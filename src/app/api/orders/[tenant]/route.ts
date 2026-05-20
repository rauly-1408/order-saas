import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderLineInput = {
  productId: string;
  name: string;
  basePriceCents: number;
  quantity: number;
  modifiersJson?: unknown;
};

type OrderBody = {
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  customerPostalCode?: string;
  channel: "DELIVERY" | "TAKEAWAY";
  notes?: string;
  items: OrderLineInput[];
};

const ORDER_NUMBER_RETRIES = 5;

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
      items,
    } = body;

    if (!customerName?.trim() || !customerPhone?.trim() || !channel || !items?.length) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    if (channel !== "DELIVERY" && channel !== "TAKEAWAY") {
      return NextResponse.json({ error: "Canal inválido" }, { status: 400 });
    }

    for (const item of items) {
      if (
        !item.productId ||
        !item.name ||
        typeof item.basePriceCents !== "number" ||
        typeof item.quantity !== "number" ||
        item.quantity < 1
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
    const existingProducts = await prisma.product.findMany({
      where: { tenantId: tenant.id, id: { in: productIds } },
      select: { id: true },
    });

    if (existingProducts.length !== productIds.length) {
      return NextResponse.json({ error: "Algunos productos no existen" }, { status: 400 });
    }

    const store = tenant.stores[0];

    if (channel === "DELIVERY" && !store.deliveryEnabled) {
      return NextResponse.json({ error: "Delivery no disponible" }, { status: 400 });
    }
    if (channel === "TAKEAWAY" && !store.takeawayEnabled) {
      return NextResponse.json({ error: "Recogida no disponible" }, { status: 400 });
    }

    const subtotalCents = items.reduce(
      (acc, item) => acc + item.basePriceCents * item.quantity,
      0
    );
    const feesCents = channel === "DELIVERY" ? store.deliveryFeeCents : 0;
    const totalCents = subtotalCents + feesCents;
    const settings = tenant.settings as Record<string, unknown>;
    const currency = (settings?.currency as string) ?? "EUR";

    const linesCreate = items.map((item) => ({
      productId: item.productId,
      productName: item.name,
      quantity: item.quantity,
      basePriceCents: item.basePriceCents,
      modifiers: (item.modifiersJson ?? []) as Prisma.InputJsonValue,
      totalCents: item.basePriceCents * item.quantity,
    }));

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
          currency,
          subtotalCents,
          feesCents,
          totalCents,
          lines: linesCreate,
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
  currency: string;
  subtotalCents: number;
  feesCents: number;
  totalCents: number;
  lines: Prisma.OrderLineCreateWithoutOrderInput[];
};

async function createOrderWithNumber(input: CreateOrderInput) {
  return prisma.$transaction(async (tx) => {
    const agg = await tx.order.aggregate({
      where: { tenantId: input.tenantId },
      _max: { orderNumber: true },
    });
    const orderNumber = (agg._max.orderNumber ?? 0) + 1;

    return tx.order.create({
      data: {
        tenantId: input.tenantId,
        storeId: input.storeId,
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
  });
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const tenantSlug = segments[segments.length - 1];

    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

    const orders = await prisma.order.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ["CREATED", "ACCEPTED", "PREPARING", "READY"] },
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ orders });
  } catch (err) {
    console.error("[GET /api/orders]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
