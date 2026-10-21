import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/app/lib/rateLimit";
import { prisma } from "@/app/lib/prisma";
import { couponDiscount, couponLabel, couponProblem, normalizeCode } from "@/app/lib/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/coupons/[tenant]?code=VUELVE15&subtotal=1990
// Vista previa para el checkout. Es pública (la usa el cliente), así que solo
// devuelve lo necesario para mostrar el descuento. El importe definitivo se
// recalcula en el servidor al crear el pedido.
export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, "coupons", 20, 60);
  if (limited) return limited;
  const url = new URL(req.url);
  const slug = url.pathname.split("/").pop() ?? "";
  const code = normalizeCode(url.searchParams.get("code") ?? "");
  const subtotalCents = Math.max(0, Math.round(Number(url.searchParams.get("subtotal")) || 0));
  if (!code) return NextResponse.json({ error: "Escribe un código" }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, addons: true } });
  const coupon =
    tenant && tenant.addons.includes("RETENTION")
      ? await prisma.coupon.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code } } })
      : null;
  if (!coupon) return NextResponse.json({ error: "Ese cupón no existe" }, { status: 404 });

  const problem = couponProblem(coupon, subtotalCents);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  return NextResponse.json({
    code: coupon.code,
    label: couponLabel(coupon),
    type: coupon.type,
    value: coupon.value,
    minOrderCents: coupon.minOrderCents,
    discountCents: couponDiscount(coupon, subtotalCents),
  });
}
