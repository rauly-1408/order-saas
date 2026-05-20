import { headers } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import { getTenantTheme, getTenantSettings, themeToCssVars, SYSTEM_DEFAULT_THEME } from "@/app/lib/tenantConfig";

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
    select: { name: true, branding: true, settings: true },
  });

  const theme = getTenantTheme((tenantData?.branding as Record<string, unknown>) ?? {});
  const storeSettings = getTenantSettings((tenantData?.settings as Record<string, unknown>) ?? {});
  const cssVars = themeToCssVars(theme ?? SYSTEM_DEFAULT_THEME);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, store: true },
  });

  if (!order) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: cssVars["--bg-base"], display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", padding: "24px", color: cssVars["--text-primary"] }}>
        <div style={{ fontSize: "48px" }}>?</div>
        <div style={{ fontSize: "18px", fontWeight: 700 }}>Pedido no encontrado</div>
        <a href={"/pedir/" + tenant} style={{ padding: "13px 28px", borderRadius: "12px", backgroundColor: cssVars["--brand-accent"], color: "#0d0d0d", fontWeight: 700, fontSize: "15px", textDecoration: "none" }}>
          Volver al menu
        </a>
      </div>
    );
  }

  const isDelivery = order.channel === "DELIVERY";
  const statusMap: Record<string, string> = {
    PENDING: "Pendiente",
    CREATED: "Recibido",
    PAID: "Pagado",
    SENT_TO_POS: "Enviado",
    ACCEPTED: "Confirmado",
    PREPARING: "En cocina",
    READY: "Listo",
    DELIVERING: "En camino",
    DELIVERED: "Entregado",
    CANCELLED: "Cancelado",
  };
  const statusLabel = statusMap[order.status] ?? order.status;
  const subtotalCents = order.items.reduce((s, i) => s + i.basePriceCents * i.quantity, 0);
  const deliveryFee = isDelivery ? (storeSettings.deliveryFeeCents ?? 200) : 0;
  const total = subtotalCents + deliveryFee;
  const tenantDisplayName = tenantData?.name ?? order.store?.name ?? tenant;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: cssVars["--bg-base"], color: cssVars["--text-primary"], fontFamily: cssVars["--font-body"] }}>

      <header style={{ backgroundColor: cssVars["--surface-0"], borderBottom: "1px solid " + cssVars["--border"], height: "56px", display: "flex", alignItems: "center", padding: "0 20px" }}>
        <span style={{ fontWeight: 700, fontSize: "16px" }}>{tenantDisplayName}</span>
      </header>

      <main style={{ maxWidth: "560px", margin: "0 auto", padding: "32px 16px 60px" }}>

        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "56px", marginBottom: "12px" }}>OK</div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "6px", color: cssVars["--text-primary"] }}>Pedido recibido!</h1>
          <p style={{ color: cssVars["--text-secondary"], fontSize: "14px", margin: "0" }}>
            {"Referencia: "}
            <span style={{ color: cssVars["--brand-accent"], fontWeight: 700 }}>
              {order.orderNumber != null
                ? "#" + order.orderNumber
                : "#" + orderId.slice(-6).toUpperCase()}
            </span>
          </p>
        </div>

        <div style={{ backgroundColor: cssVars["--surface-1"], border: "1px solid " + cssVars["--border"], borderRadius: "16px", padding: "20px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "14px", color: cssVars["--text-secondary"], fontWeight: 600 }}>Estado del pedido</span>
          <span style={{ fontSize: "15px", fontWeight: 700, color: cssVars["--brand-accent"] }}>{statusLabel}</span>
        </div>

        <div style={{ backgroundColor: cssVars["--surface-1"], border: "1px solid " + cssVars["--border"], borderRadius: "16px", padding: "20px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: cssVars["--text-secondary"], textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
            Datos del pedido
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
            <span style={{ color: cssVars["--text-secondary"] }}>Nombre</span>
            <span style={{ fontWeight: 600 }}>{order.customerName}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
            <span style={{ color: cssVars["--text-secondary"] }}>Telefono</span>
            <span style={{ fontWeight: 600 }}>{order.customerPhone}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
            <span style={{ color: cssVars["--text-secondary"] }}>Tipo</span>
            <span style={{ fontWeight: 600 }}>{isDelivery ? "Delivery" : "Recogida"}</span>
          </div>
          {isDelivery && order.customerAddress && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
              <span style={{ color: cssVars["--text-secondary"] }}>Direccion</span>
              <span style={{ fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{order.customerAddress}</span>
            </div>
          )}
          {order.notes && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
              <span style={{ color: cssVars["--text-secondary"] }}>Notas</span>
              <span style={{ fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{order.notes}</span>
            </div>
          )}
        </div>

        <div style={{ backgroundColor: cssVars["--surface-1"], border: "1px solid " + cssVars["--border"], borderRadius: "16px", padding: "20px", marginBottom: "16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: cssVars["--text-secondary"], textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "14px" }}>
            Productos
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {order.items.map((item) => (
              <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                <span>
                  <span style={{ fontWeight: 700, color: cssVars["--brand-accent"], marginRight: "8px" }}>{item.quantity}x</span>
                  {item.productName}
                </span>
                <span style={{ fontWeight: 600 }}>{euros(item.basePriceCents * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid " + cssVars["--border"], marginTop: "16px", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: cssVars["--text-secondary"] }}>
              <span>Subtotal</span>
              <span>{euros(subtotalCents)}</span>
            </div>
            {isDelivery && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: cssVars["--text-secondary"] }}>
                <span>Envio</span>
                <span>{deliveryFee === 0 ? "Gratis" : euros(deliveryFee)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "16px", fontWeight: 700 }}>
              <span>Total</span>
              <span style={{ color: cssVars["--brand-accent"] }}>{euros(total)}</span>
            </div>
          </div>
        </div>

        <a
          href={"/pedir/" + tenant}
          style={{ display: "block", width: "100%", padding: "16px", borderRadius: "14px", backgroundColor: cssVars["--brand-accent"], color: "#0d0d0d", fontWeight: 800, fontSize: "16px", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}
        >
          Hacer otro pedido
        </a>

      </main>
    </div>
  );
}
