import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderItemInput = {
      productId: string;
      name: string;
      basePriceCents: number;
      quantity: number;
      modifiersJson?: Record<string, unknown>[];
};

type OrderBody = {
      customerName: string;
      customerPhone: string;
      customerAddress?: string;
      customerPostalCode?: string;
      channel: "DELIVERY" | "TAKEAWAY";
      notes?: string;
      items: OrderItemInput[];
};

export async function POST(req: NextRequest) {
      try {
              const url = new URL(req.url);
              const segments = url.pathname.split("/");
              const tenantSlug = segments[segments.length - 1];

        const body: OrderBody = await req.json();
              const { customerName, customerPhone, customerAddress, customerPostalCode, channel, notes, items } = body;

        if (!customerName || !customerPhone || !channel || !items?.length) {
                  return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
        }

        const tenant = await prisma.tenant.findUnique({
                  where: { slug: tenantSlug },
                  include: { stores: { take: 1 } },
        });

        if (!tenant || !tenant.stores[0]) {
                  return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
        }

        const store = tenant.stores[0];
              const subtotalCents = items.reduce((acc, item) => acc + item.basePriceCents * item.quantity, 0);
              const channels = store.channels as Record<string, Record<string, number>>;
              const feesCents = channel === "DELIVERY" ? (channels?.DELIVERY?.feeCents ?? 0) : 0;
              const totalCents = subtotalCents + feesCents;
              const settings = tenant.settings as Record<string, unknown>;

        const order = await prisma.order.create({
                  data: {
                              tenantId: tenant.id,
                              storeId: store.id,
                              channel,
                              status: "CREATED",
                              customerName,
                              customerPhone,
                              customerAddress: customerAddress ?? null,
                              customerPostalCode: customerPostalCode ?? null,
                              notes: notes ?? null,
                              currency: (settings?.currency as string) ?? "EUR",
                              subtotalCents,
                              feesCents,
                              totalCents,
                              items: {
                                            create: items.map((item) => ({
                                                            productId: item.productId,
                                                            productName: item.name,
                                                            quantity: item.quantity,
                                                            basePriceCents: item.basePriceCents,
                                                            modifiersJson: item.modifiersJson ?? [],
                                                            lineTotalCents: item.basePriceCents * item.quantity,
                                            })),
                              },
                  },
                  include: { items: true },
        });

        return NextResponse.json({
                  orderId: order.id,
                  status: order.status,
                  totalCents: order.totalCents,
                  estimatedMinutes: channel === "DELIVERY"
                    ? (channels?.DELIVERY?.etaMin ?? 35)
                              : (channels?.TAKEAWAY?.etaMin ?? 20),
        });
      } catch (err) {
              console.error("[POST /api/orders]", err);
              return NextResponse.json({ error: "Error interno" }, { status: 500 });
      }
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
