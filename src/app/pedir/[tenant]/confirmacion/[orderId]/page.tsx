import { prisma } from "@/app/lib/prisma";
import { discountLines } from "@/app/lib/promotions";
import { getTenantTheme, themeToCssVars, SYSTEM_DEFAULT_THEME } from "@/app/lib/tenantConfig";
import { parseOnline } from "@/app/lib/brand";
import OrderTracker from "./OrderTracker";
import { ui } from "@/app/lib/i18n";
import { storeLang } from "@/app/lib/storeLang";

const euros = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

export default async function ConfirmacionPage({
  params,
}: {
  params: Promise<{ tenant: string; orderId: string }>;
}) {
  const { tenant, orderId } = await params;

  const tenantData = await prisma.tenant.findUnique({
    where: { slug: tenant },
    select: { id: true, name: true, branding: true, settings: true },
  });

  const lang = await storeLang(tenantData?.settings);
  const T = ui(lang);
  const theme = getTenantTheme((tenantData?.branding as Record<string, unknown>) ?? {});
  const cssVars = themeToCssVars(theme ?? SYSTEM_DEFAULT_THEME);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, store: true, coupon: { select: { code: true } }, promotion: { select: { name: true } }, review: { select: { rating: true, comment: true } } },
  });

  // El pedido tiene que ser de este restaurante.
  if (!order || order.tenantId !== tenantData?.id) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: cssVars["--bg-base"], display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", padding: "24px", color: cssVars["--text-primary"] }}>
        <div style={{ fontSize: "48px" }}>?</div>
        <div style={{ fontSize: "18px", fontWeight: 700 }}>{T.orderNotFound}</div>
        <a href={"/pedir/" + tenant} style={{ padding: "13px 28px", borderRadius: "999px", backgroundColor: cssVars["--brand-accent"], color: cssVars["--on-accent"], fontWeight: 700, fontSize: "15px", textDecoration: "none" }}>
          {T.backToMenu}
        </a>
      </div>
    );
  }

  const isDelivery = order.channel === "DELIVERY";
  // Importes tal como se guardaron en el pedido (incluyen suplementos y cupón).
  const subtotalCents = order.subtotalCents;
  const deliveryFee = order.feesCents;
  const total = order.totalCents;
  const tenantDisplayName = tenantData?.name ?? order.store?.name ?? tenant;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: cssVars["--bg-base"], color: cssVars["--text-primary"], fontFamily: cssVars["--font-body"], ...(cssVars as React.CSSProperties) }}>

      <header style={{ backgroundColor: cssVars["--surface-0"], borderBottom: "1px solid " + cssVars["--border"], height: "56px", display: "flex", alignItems: "center", padding: "0 20px" }}>
        <span style={{ fontWeight: 600, fontSize: "16px" }}>{tenantDisplayName}</span>
      </header>

      <main style={{ maxWidth: "560px", margin: "0 auto", padding: "32px 16px 60px" }}>

        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div className="p-rise" style={{ width: "72px", height: "72px", margin: "0 auto 18px", borderRadius: "999px", backgroundColor: cssVars["--brand-accent"], color: cssVars["--on-accent"], display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </div>
          <h1 className="p-rise" style={{ ["--i" as string]: 1, fontFamily: cssVars["--font-heading"], textTransform: cssVars["--heading-case"] as "none", fontSize: "40px", lineHeight: 1, fontWeight: cssVars["--heading-case"] === "uppercase" ? 400 : 700, marginBottom: "10px", color: cssVars["--brand-accent"] }}>{T.orderReceived}</h1>
          <p style={{ color: cssVars["--text-secondary"], fontSize: "14px", margin: "0" }}>
            {T.reference}
            <span style={{ color: cssVars["--brand-accent"], fontWeight: 700 }}>
              {order.orderNumber != null
                ? "#" + order.orderNumber
                : "#" + orderId.slice(-6).toUpperCase()}
            </span>
          </p>
        </div>

        {/* Seguimiento en vivo, aviso en el móvil y valoración al entregarlo */}
        <OrderTracker
          lang={lang}
          orderId={order.id}
          channel={order.channel}
          initialStatus={order.status}
          estimatedReadyAt={order.estimatedReadyAt?.toISOString() ?? null}
          initialReview={order.review}
          googleReviewUrl={parseOnline((tenantData?.branding as Record<string, unknown> | null)?.online).reviewsUrl}
        />

        <div style={{ backgroundColor: cssVars["--surface-1"], boxShadow: "0 1px 2px rgba(0,0,0,0.05)", borderRadius: "18px", padding: "20px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ fontSize: "13px", fontWeight: 500, color: cssVars["--text-secondary"], marginBottom: "4px" }}>
            {T.orderDetails}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
            <span style={{ color: cssVars["--text-secondary"] }}>{T.nameLabel}</span>
            <span style={{ fontWeight: 600 }}>{order.customerName}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
            <span style={{ color: cssVars["--text-secondary"] }}>{T.phoneLabel}</span>
            <span style={{ fontWeight: 600 }}>{order.customerPhone}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
            <span style={{ color: cssVars["--text-secondary"] }}>{T.typeLabel}</span>
            <span style={{ fontWeight: 600 }}>{isDelivery ? T.deliveryOnly : lang === "en" ? "Pickup" : "Recogida"}</span>
          </div>
          {isDelivery && order.customerAddress && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
              <span style={{ color: cssVars["--text-secondary"] }}>{T.addressLabel}</span>
              <span style={{ fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{order.customerAddress}</span>
            </div>
          )}
          {order.notes && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
              <span style={{ color: cssVars["--text-secondary"] }}>{T.notesLabel}</span>
              <span style={{ fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{order.notes}</span>
            </div>
          )}
        </div>

        <div style={{ backgroundColor: cssVars["--surface-1"], boxShadow: "0 1px 2px rgba(0,0,0,0.05)", borderRadius: "18px", padding: "20px", marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: 500, color: cssVars["--text-secondary"], marginBottom: "14px" }}>
            {T.products}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {order.items.map((item) => (
              <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                <span>
                  <span style={{ fontWeight: 700, color: cssVars["--brand-accent"], marginRight: "8px" }}>{item.quantity}x</span>
                  {item.productName}
                </span>
                <span style={{ fontWeight: 600 }}>{euros(item.totalCents)}</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid " + cssVars["--border"], marginTop: "16px", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: cssVars["--text-secondary"] }}>
              <span>{T.subtotal}</span>
              <span>{euros(subtotalCents)}</span>
            </div>
            {discountLines(order).map((d) => (
              <div key={d.label} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 600, color: cssVars["--brand-secondary"] }}>
                <span>{d.label}</span>
                <span>−{euros(d.cents)}</span>
              </div>
            ))}
            {isDelivery && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: cssVars["--text-secondary"] }}>
                <span>{T.shipping}</span>
                <span>{deliveryFee === 0 ? T.free : euros(deliveryFee)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "16px", fontWeight: 700 }}>
              <span>{T.total}</span>
              <span style={{ color: cssVars["--brand-accent"] }}>{euros(total)}</span>
            </div>
          </div>
        </div>

        <a
          href={"/pedir/" + tenant}
          style={{ display: "block", width: "100%", padding: "16px", borderRadius: "14px", backgroundColor: cssVars["--brand-accent"], color: cssVars["--on-accent"], fontWeight: 800, fontSize: "16px", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}
        >
          {T.orderAgain}
        </a>

      </main>
    </div>
  );
}
