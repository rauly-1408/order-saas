/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/store/cart";
import type { TenantTheme, StoreSettings } from "@/app/lib/tenantConfig";
import { themeToCssVars, SYSTEM_DEFAULT_THEME } from "@/app/lib/tenantConfig";

const euros = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

type CheckoutClientProps = {
  tenant: string;
  theme?: TenantTheme;
  settings?: StoreSettings;
};

export default function CheckoutClient({ tenant, theme, settings }: CheckoutClientProps) {
  const router = useRouter();
  const { items, subtotalCents, clear } = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<"TAKEAWAY" | "DELIVERY">("TAKEAWAY");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Theme dinámico del tenant
  const t = theme ?? SYSTEM_DEFAULT_THEME;
  const cssVars = themeToCssVars(t);

  // Costes desde settings del tenant
  const deliveryFee = settings?.deliveryFeeCents ?? 200;
  const deliveryEnabled = settings?.deliveryEnabled ?? true;
  const takeawayEnabled = settings?.takeawayEnabled ?? true;

  const subtotal = subtotalCents();
  const fee = channel === "DELIVERY" ? deliveryFee : 0;
  const total = subtotal + fee;
  const count = items.reduce((a, i) => a + i.quantity, 0);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "13px 16px",
    borderRadius: cssVars["--border-radius"] ?? "12px",
    border: `1px solid ${cssVars["--border"]}`,
    backgroundColor: cssVars["--surface-1"],
    color: cssVars["--text-primary"],
    fontSize: "15px",
    outline: "none",
    fontFamily: cssVars["--font-body"],
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: cssVars["--text-secondary"],
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  };

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
      <div style={{ minHeight: "100vh", backgroundColor: cssVars["--bg-base"], display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", padding: "24px", ...(cssVars as any) }}>
        <div style={{ fontSize: "48px" }}>🛒</div>
        <div style={{ fontSize: "18px", fontWeight: 700, color: cssVars["--text-primary"] }}>Tu carrito está vacío</div>
        <a href={`/pedir/${tenant}`} style={{ padding: "13px 28px", borderRadius: cssVars["--border-radius"] ?? "12px", backgroundColor: cssVars["--brand-accent"], color: "#0d0d0d", fontWeight: 700, fontSize: "15px", textDecoration: "none" }}>
          Volver al menú
        </a>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: cssVars["--bg-base"], color: cssVars["--text-primary"], fontFamily: cssVars["--font-body"], ...(cssVars as any) }}>

      {/* HEADER */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, backgroundColor: cssVars["--surface-0"], borderBottom: `1px solid ${cssVars["--border"]}`, height: "56px", display: "flex", alignItems: "center", padding: "0 20px", gap: "14px" }}>
        <a href={`/pedir/${tenant}`} style={{ color: cssVars["--brand-accent"], fontSize: "22px", textDecoration: "none", lineHeight: "1" }}>←</a>
        <span style={{ fontWeight: 700, fontSize: "16px" }}>Confirmar pedido</span>
      </header>

      <main style={{ maxWidth: "560px", margin: "0 auto", padding: "24px 16px 120px" }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* RESUMEN DEL PEDIDO */}
          <div style={{ backgroundColor: cssVars["--surface-1"], border: `1px solid ${cssVars["--border"]}`, borderRadius: "16px", padding: "20px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: cssVars["--text-secondary"], textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "14px" }}>
              Tu pedido · {count} {count === 1 ? "producto" : "productos"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {items.map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ minWidth: "22px", height: "22px", borderRadius: "6px", backgroundColor: cssVars["--brand-accent"], color: "#0d0d0d", fontWeight: 700, fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {item.quantity}
                    </span>
                    <span style={{ fontSize: "14px", color: cssVars["--text-primary"] }}>{item.name}</span>
                  </div>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: cssVars["--text-primary"] }}>
                    {euros(item.unitPriceCents * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            {/* TOTALES */}
            <div style={{ borderTop: `1px solid ${cssVars["--border"]}`, marginTop: "16px", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: cssVars["--text-secondary"] }}>
                <span>Subtotal</span>
                <span>{euros(subtotal)}</span>
              </div>
              {channel === "DELIVERY" && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: cssVars["--text-secondary"] }}>
                  <span>Gastos de envío</span>
                  <span>{deliveryFee === 0 ? "Gratis" : euros(deliveryFee)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "16px", fontWeight: 700, color: cssVars["--text-primary"] }}>
                <span>Total</span>
                <span style={{ color: cssVars["--brand-accent"] }}>{euros(total)}</span>
              </div>
            </div>
          </div>

          {/* MODALIDAD */}
          {(deliveryEnabled || takeawayEnabled) && (
            <div>
              <div style={labelStyle}>Modalidad</div>
              <div style={{ display: "flex", gap: "10px" }}>
                {takeawayEnabled && (
                  <button
                    type="button"
                    onClick={() => setChannel("TAKEAWAY")}
                    style={{ flex: 1, padding: "12px", borderRadius: "12px", border: `2px solid ${channel === "TAKEAWAY" ? cssVars["--brand-accent"] : cssVars["--border"]}`, backgroundColor: channel === "TAKEAWAY" ? `${cssVars["--brand-accent"]}15` : "transparent", color: channel === "TAKEAWAY" ? cssVars["--brand-accent"] : cssVars["--text-secondary"], fontWeight: channel === "TAKEAWAY" ? 700 : 400, fontSize: "14px", cursor: "pointer" }}
                  >
                    🏪 Recoger
                  </button>
                )}
                {deliveryEnabled && (
                  <button
                    type="button"
                    onClick={() => setChannel("DELIVERY")}
                    style={{ flex: 1, padding: "12px", borderRadius: "12px", border: `2px solid ${channel === "DELIVERY" ? cssVars["--brand-accent"] : cssVars["--border"]}`, backgroundColor: channel === "DELIVERY" ? `${cssVars["--brand-accent"]}15` : "transparent", color: channel === "DELIVERY" ? cssVars["--brand-accent"] : cssVars["--text-secondary"], fontWeight: channel === "DELIVERY" ? 700 : 400, fontSize: "14px", cursor: "pointer" }}
                  >
                    🛵 Delivery
                  </button>
                )}
              </div>
            </div>
          )}

          {/* DATOS DE CONTACTO */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={labelStyle}>Nombre *</label>
              <input
                style={inputStyle}
                type="text"
                placeholder="Tu nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Teléfono *</label>
              <input
                style={inputStyle}
                type="tel"
                placeholder="6XX XXX XXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            {channel === "DELIVERY" && (
              <div>
                <label style={labelStyle}>Dirección de entrega *</label>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="Calle, número, piso..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                />
              </div>
            )}
            <div>
              <label style={labelStyle}>Notas (opcional)</label>
              <textarea
                style={{ ...inputStyle, minHeight: "80px", resize: "vertical" } as React.CSSProperties}
                placeholder="Sin cebolla, alergia a los frutos secos..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* ERROR */}
          {error && (
            <div style={{ padding: "12px 16px", borderRadius: "10px", backgroundColor: "#3d1515", border: "1px solid #7d2525", color: "#ff8080", fontSize: "14px" }}>
              {error}
            </div>
          )}

          {/* SUBMIT */}
          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "16px", borderRadius: cssVars["--border-radius"] ?? "14px", border: "none", backgroundColor: loading ? cssVars["--surface-2"] : cssVars["--brand-accent"], color: loading ? cssVars["--text-secondary"] : "#0d0d0d", fontWeight: 800, fontSize: "16px", cursor: loading ? "not-allowed" : "pointer", letterSpacing: "0.3px" }}
          >
            {loading ? "Enviando pedido..." : `Confirmar pedido · ${euros(total)}`}
          </button>

        </form>
      </main>
    </div>
  );
}
