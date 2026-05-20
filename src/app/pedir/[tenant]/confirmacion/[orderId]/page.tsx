import { prisma } from "@/app/lib/prisma";

const euros = (cents: number) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

export default async function ConfirmacionPage({
    params,
}: {
    params: Promise<{ tenant: string; orderId: string }>;
}) {
    const { tenant, orderId } = await params;

  const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true, store: true },
  });

  const bg = "var(--bg-base)";
    const surface0 = "var(--surface-0)";
    const surface1 = "var(--surface-1)";
    const border = "var(--border)";
    const textPrimary = "var(--text-primary)";
    const textSecondary = "var(--text-secondary)";
    const accent = "var(--brand-accent)";

  if (!order) {
        return (
                <div style={{ minHeight: "100vh", backgroundColor: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", padding: "24px", color: textPrimary }}>
                          <div style={{ fontSize: "48px" }}>❓</div>div>
                          <div style={{ fontSize: "18px", fontWeight: 700 }}>Pedido no encontrado</div>div>
                          <a href={`/pedir/${tenant}`} style={{ padding: "13px 28px", borderRadius: "12px", backgroundColor: accent, color: "#0d0d0d", fontWeight: 700, fontSize: "15px", textDecoration: "none" }}>
                                      Volver al menú
                          </a>a>
                </div>div>
              );
  }

  const isDelivery = order.channel === "DELIVERY";
    const statusMap: Record<string, string> = {
          PENDING: "⏳ Pendiente",
          CONFIRMED: "✅ Confirmado",
          PREPARING: "👨‍🍳 En cocina",
          READY: "🔔 Listo",
          DELIVERED: "🛵 Entregado",
          CANCELLED: "❌ Cancelado",
    };
    const statusLabel = statusMap[order.status] ?? order.status;
    const totalCents = order.items.reduce((s, i) => s + i.basePriceCents * i.quantity, 0);
    const fee = isDelivery ? 200 : 0;
    const total = totalCents + fee;

  return (
        <div style={{ minHeight: "100vh", backgroundColor: bg, color: textPrimary, fontFamily: "var(--font-body)" }}>
          {/* HEADER */}
                <header style={{ backgroundColor: surface0, borderBottom: `1px solid ${border}`, height: "56px", display: "flex", alignItems: "center", padding: "0 20px" }}>
                          <span style={{ fontWeight: 700, fontSize: "16px" }}>{order.store?.name ?? tenant}</span>span>
                </header>header>

                <main style={{ maxWidth: "560px", margin: "0 auto", padding: "32px 16px 60px" }}>
                  {/* HERO CONFIRMACION */}
                          <div style={{ textAlign: "center", marginBottom: "32px" }}>
                                      <div style={{ fontSize: "56px", marginBottom: "12px" }}>🎉</div>div>
                                      <h1 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "6px" }}>¡Pedido recibido!</h1>h1>
                                      <p style={{ color: textSecondary, fontSize: "14px" }}>
                                                    Referencia: <span style={{ color: accent, fontWeight: 700 }}>#{orderId.slice(-6).toUpperCase()}</span>span>
                                      </p>p>
                          </div>div>

                  {/* ESTADO */}
                          <div style={{ backgroundColor: surface1, border: `1px solid ${border}`, borderRadius: "16px", padding: "20px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                      <span style={{ fontSize: "14px", color: textSecondary, fontWeight: 600 }}>Estado del pedido</span>span>
                                      <span style={{ fontSize: "15px", fontWeight: 700, color: accent }}>{statusLabel}</span>span>
                          </div>div>

                  {/* INFO CLIENTE */}
                          <div style={{ backgroundColor: surface1, border: `1px solid ${border}`, borderRadius: "16px", padding: "20px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                                      <div style={{ fontSize: "12px", fontWeight: 700, color: textSecondary, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                                                    Datos del pedido
                                      </div>div>
                                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                                                    <span style={{ color: textSecondary }}>Nombre</span>span>
                                                    <span style={{ fontWeight: 600 }}>{order.customerName}</span>span>
                                      </div>div>
                                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                                                    <span style={{ color: textSecondary }}>Teléfono</span>span>
                                                    <span style={{ fontWeight: 600 }}>{order.customerPhone}</span>span>
                                      </div>div>
                                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                                                    <span style={{ color: textSecondary }}>Tipo</span>span>
                                                    <span style={{ fontWeight: 600 }}>{isDelivery ? "🛵 Delivery" : "🏃 Recogida"}</span>span>
                                      </div>div>
                            {isDelivery && order.customerAddress && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                                      <span style={{ color: textSecondary }}>Dirección</span>span>
                                      <span style={{ fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{order.customerAddress}</span>span>
                      </div>div>
                    )}
                            {order.notes && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                                      <span style={{ color: textSecondary }}>Notas</span>span>
                                      <span style={{ fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{order.notes}</span>span>
                      </div>div>
                    )}
                          </div>div>

                  {/* PRODUCTOS */}
                          <div style={{ backgroundColor: surface1, border: `1px solid ${border}`, borderRadius: "16px", padding: "20px", marginBottom: "16px" }}>
                                      <div style={{ fontSize: "12px", fontWeight: 700, color: textSecondary, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "14px" }}>
                                                    Productos
                                      </div>div>
                                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                        {order.items.map((item) => (
                        <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                                          <span>
                                                            <span style={{ fontWeight: 700, color: accent, marginRight: "8px" }}>{item.quantity}×</span>span>
                                            {item.name}
                                          </span>span>
                                        <span style={{ fontWeight: 600 }}>{euros(item.basePriceCents * item.quantity)}</span>span>
                        </div>div>
                      ))}
                                      </div>div>
                                    <div style={{ borderTop: `1px solid ${border}`, marginTop: "14px", paddingTop: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
feat(sprint3): redesign confirmacion - dark premium, amber accents, CSS vars                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: textSecondary }}>
                                        <span>Envío</span>span><span>{euros(fee)}</span>span>
                        </div>div>
                                                )}
                                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "16px", fontWeight: 800, color: textPrimary }}>
                                                              <span>Total</span>span>
                                                              <span style={{ color: accent }}>{euros(total)}</span>span>
                                                </div>div>
                                    </div>div>
                          </div>
                
                  {/* CTA VOLVER */}
                        <a
                                    href={`/pedir/${tenant}`}
                                    style={{
                                                  display: "block", textAlign: "center",
                                                  padding: "15px", borderRadius: "14px",
                                                  backgroundColor: accent, color: "#0d0d0d",
                                                  fontWeight: 800, fontSize: "16px",
                                                  textDecoration: "none"
                                    }}
                                  >
                                  Hacer otro pedido
                        </a>a>
                </main>main>
        </div>div>
      );
}</span>
