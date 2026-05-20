"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/store/cart";

const euros = (cents: number) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "13px 16px",
    borderRadius: "12px",
    border: "1px solid var(--border)",
    backgroundColor: "var(--surface-1)",
    color: "var(--text-primary)",
    fontSize: "15px",
    outline: "none",
    fontFamily: "var(--font-body)"
};

const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
};

export default function CheckoutClient({ tenant }: { tenant: string }) {
    const router = useRouter();
    const { items, subtotalCents, clear } = useCart();
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [channel, setChannel] = useState<"TAKEAWAY" | "DELIVERY">("TAKEAWAY");
    const [address, setAddress] = useState("");
    const [notes, setNotes] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

  const subtotal = subtotalCents();
    const fee = channel === "DELIVERY" ? 200 : 0;
    const total = subtotal + fee;
    const count = items.reduce((a, i) => a + i.quantity, 0);

  async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
                const res = await fetch(`/api/orders/${tenant}`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                                      customerName: name,
                                      customerPhone: phone,
                                      customerAddress: channel === "DELIVERY" ? address : undefined,
                                      channel,
                                      notes: notes || undefined,
                                      items: items.map((item) => ({
                                                    productId: item.productId,
                                                    name: item.name,
                                                    basePriceCents: item.unitPriceCents,
                                                    quantity: item.quantity,
                                                    modifiersJson: item.modifiers ? [item.modifiers] : [],
                                      })),
                          }),
                });
                if (!res.ok) {
                          const data = await res.json();
                          setError(data.error ?? "Error al crear el pedido");
                          return;
                }
                const data = await res.json();
                clear();
                router.push(`/pedir/${tenant}/confirmacion/${data.orderId}`);
        } catch {
                setError("Error de red. Inténtalo de nuevo.");
        } finally {
                setLoading(false);
        }
  }

  if (items.length === 0) {
        return (
                <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-base)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", padding: "24px" }}>
                          <div style={{ fontSize: "48px" }}>🛒</div>div>
                          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>Tu carrito está vacío</div>div>
                          <a href={`/pedir/${tenant}`} style={{ padding: "13px 28px", borderRadius: "12px", backgroundColor: "var(--brand-accent)", color: "#0d0d0d", fontWeight: 700, fontSize: "15px", textDecoration: "none" }}>
                                      Volver al menú
                          </a>a>
                </div>div>
              );
  }

  return (
        <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
          {/* HEADER */}
                <header style={{
                  position: "sticky", top: 0, zIndex: 50,
                  backgroundColor: "var(--surface-0)",
                  borderBottom: "1px solid var(--border)",
                  height: "56px", display: "flex", alignItems: "center",
                  padding: "0 20px", gap: "14px"
        }}>
                          <a href={`/pedir/${tenant}`} style={{ color: "var(--brand-accent)", fontSize: "22px", textDecoration: "none", lineHeight: 1 }}>←</a>a>
                          <span style={{ fontWeight: 700, fontSize: "16px" }}>Confirmar pedido</span>span>
                </header>header>

                <main style={{ maxWidth: "560px", margin: "0 auto", padding: "24px 16px 120px" }}>
                          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

                            {/* RESUMEN DEL PEDIDO */}
                                      <div style={{ backgroundColor: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "16px", padding: "20px" }}>
                                                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "14px" }}>
                                                                    Tu pedido · {count} {count === 1 ? "producto" : "productos"}
                                                    </div>div>
                                                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                                      {items.map((item) => (
                          <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                              <span style={{ fontSize: "14px", color: "var(--text-primary)" }}>
                                                                    <span style={{ fontWeight: 700, color: "var(--brand-accent)", marginRight: "8px" }}>{item.quantity}×</span>span>
                                                {item.name}
                                              </span>span>
                                              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                                                {euros(item.unitPriceCents * item.quantity)}
                                              </span>span>
                          </div>div>
                        ))}
                                                    </div>div>
                                                    <div style={{ borderTop: "1px solid var(--border)", marginTop: "14px", paddingTop: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
                                                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "var(--text-secondary)" }}>
                                                                                      <span>Subtotal</span>span><span>{euros(subtotal)}</span>span>
                                                                    </div>div>
                                                      {fee > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "var(--text-secondary)" }}>
                                            <span>Envío</span>span><span>{euros(fee)}</span>span>
                          </div>div>
                                                                  )}
                                                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
                                                                                  <span>Total</span>span><span style={{ color: "var(--brand-accent)" }}>{euros(total)}</span>span>
                                                                  </div>div>
                                                    </div>div>
                                      </div>div>
                          
                            {/* CANAL */}
                                    <div>
                                                <label style={labelStyle}>Tipo de pedido</label>label>
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                                  {(["TAKEAWAY", "DELIVERY"] as const).map((ch) => (
                          <button
                                              key={ch}
                                              type="button"
                                              onClick={() => setChannel(ch)}
                                              style={{
                                                                    padding: "14px", borderRadius: "12px", cursor: "pointer",
                                                                    border: channel === ch ? "2px solid var(--brand-accent)" : "1px solid var(--border)",
                                                                    backgroundColor: channel === ch ? "rgba(232, 160, 32, 0.1)" : "var(--surface-1)",
                                                                    color: channel === ch ? "var(--brand-accent)" : "var(--text-secondary)",
                                                                    fontWeight: 700, fontSize: "14px"
                                              }}
                                            >
                            {ch === "TAKEAWAY" ? "🏃 Recoger" : "🛵 Delivery"}
                          </button>button>
                        ))}
                                                </div>div>
                                    </div>div>
                          
                            {/* DATOS CLIENTE */}
                                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                                <div>
                                                              <label style={labelStyle}>Nombre *</label>label>
                                                              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" style={inputStyle} />
                                                </div>div>
                                                <div>
                                                              <label style={labelStyle}>Teléfono *</label>label>
                                                              <input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="600 000 000" type="tel" style={inputStyle} />
                                                </div>div>
                                      {channel === "DELIVERY" && (
                        <div>
                                        <label style={labelStyle}>Dirección de entrega *</label>label>
                                        <input required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, número, piso..." style={inputStyle} />
                        </div>div>
                                                )}
                                                <div>
                                                              <label style={labelStyle}>Notas (opcional)</label>label>
                                                              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sin cebolla, alergia a..." rows={3}
                                                                                style={{ ...inputStyle, resize: "none", lineHeight: "1.5" }} />
                                                </div>div>
                                    </div>div>
                          
                            {/* ERROR */}
                            {error && (
                      <div style={{ padding: "14px 16px", borderRadius: "12px", backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontSize: "14px" }}>
                        {error}
                      </div>div>
                                    )}
                          
                            {/* SUBMIT */}
                                    <button
                                                  type="submit"
                                                  disabled={loading}
                                                  style={{
                                                                  padding: "16px", borderRadius: "14px", border: "none",
                                                                  backgroundColor: loading ? "var(--surface-2)" : "var(--brand-accent)",
                                                                  color: loading ? "var(--text-secondary)" : "#0d0d0d",
                                                                  fontWeight: 800, fontSize: "16px", cursor: loading ? "not-allowed" : "pointer",
                                                                  transition: "all 0.2s"
                                                  }}
                                                >
                                      {loading ? "Enviando pedido..." : `Confirmar pedido · ${euros(total)}`}
                                    </button>button>
                          </form>form>
                </main>main>
        </div>div>
      );
}</span>
