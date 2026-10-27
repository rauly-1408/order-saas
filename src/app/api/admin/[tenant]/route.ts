import { NextRequest, NextResponse } from "next/server";
import { readCheckout, readPolicies, readTax } from "@/app/lib/storePolicies";
import { LEGAL_DOCS } from "@/app/lib/business";
import { parsePartners, partnersProblem } from "@/app/lib/deliveryPartners";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getTenantSlug(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split("/");
  return segments[segments.length - 1];
}

// GET /api/admin/[tenant] → datos del tenant (branding, settings, categorías, productos)
export async function GET(req: NextRequest) {
  try {
    const slug = getTenantSlug(req);
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, branding: true, settings: true },
    });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    const denied = await denyUnlessTenantAdmin(req, tenant.id);
    if (denied) return denied;

    const categories = await prisma.category.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        products: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true, name: true, description: true, basePriceCents: true,
            imageUrl: true, isActive: true, isAvailable: true, isFeatured: true, dietTags: true, sortOrder: true,
          },
        },
      },
    });

    return NextResponse.json({ tenant, categories });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// PATCH /api/admin/[tenant] → actualizar branding y/o settings del tenant
export async function PATCH(req: NextRequest) {
  try {
    const slug = getTenantSlug(req);
    const body = await req.json();
    const { branding, settings, name } = body;

    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    const denied = await denyUnlessTenantAdmin(req, tenant.id);
    if (denied) return denied;

    const currentBranding = (tenant.branding as Record<string, unknown>) ?? {};
    const currentSettings = (tenant.settings as Record<string, unknown>) ?? {};

    // Reparto con plataformas: solo enlaces a la web de cada una.
    if (settings !== undefined && (settings as Record<string, unknown>).deliveryPartners !== undefined) {
      const raw = (settings as Record<string, unknown>).deliveryPartners;
      const problem = partnersProblem(raw);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      (settings as Record<string, unknown>).deliveryPartners = parsePartners(raw);
    }

    // Pantalla de pago, impuestos y políticas: se guardan ya normalizados.
    if (settings !== undefined) {
      const s = settings as Record<string, unknown>;
      if (s.checkout !== undefined) s.checkout = readCheckout({ checkout: s.checkout });
      if (s.tax !== undefined) s.tax = readTax({ tax: s.tax });
      if (s.policies !== undefined) {
        const slugs = LEGAL_DOCS.map((d) => d.slug as string);
        s.policies = Object.fromEntries(Object.entries(readPolicies({ policies: s.policies })).filter(([k]) => slugs.includes(k)));
      }
    }

    // Lo operativo vive en el local (Store): es lo que usan los pedidos.
    if (settings !== undefined) {
      const s = settings as Record<string, unknown>;
      const int = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : undefined);
      const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
      await prisma.store.updateMany({
        where: { tenantId: tenant.id },
        data: {
          deliveryEnabled: bool(s.deliveryEnabled),
          takeawayEnabled: bool(s.takeawayEnabled),
          deliveryFeeCents: int(s.deliveryFeeCents),
          minimumOrderCents: int(s.minimumOrderCents),
          estimatedDeliveryMinutes: int(s.estimatedDeliveryMinutes),
          estimatedPickupMinutes: int(s.estimatedPickupMinutes),
        },
      });
    }

    const updated = await prisma.tenant.update({
      where: { slug },
      data: {
        ...(name !== undefined && { name }),
        ...(branding !== undefined && { branding: { ...currentBranding, ...branding } }),
        ...(settings !== undefined && { settings: { ...currentSettings, ...settings } }),
      },
    });

    return NextResponse.json({ ok: true, tenant: updated });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
