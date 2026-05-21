"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Helpers ───────────────────────────────────────────────
const toEuros = (c: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(c / 100);

function timeAgo(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return secs + "s";
  if (secs < 3600) return Math.floor(secs / 60) + " min";
  return Math.floor(secs / 3600) + " h";
}

// ─── Types ─────────────────────────────────────────────────
type OItem = { id: string; productName: string; quantity: number; lineTotalCents: number };
type Order = {
  id: string; status: string; channel: string; customerName: string;
  customerPhone: string; customerAddress: string | null; notes: string | null;
  totalCents: number; createdAt: string; items: OItem[];
};
type Product = {
  id: string; name: string; description: string | null; basePriceCents: number;
  imageUrl: string | null; isActive: boolean; isAvailable: boolean;
  isFeatured: boolean; sortOrder: number; categoryId?: string;
};
type Category = { id: string; name: string; products: Product[] };
type TenantData = {
  tenant: { id: string; slug: string; name: string; branding: Record<string, unknown>; settings: Record<string, unknown> };
  categories: Category[];
};

// ─── Constantes ────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  CREATED: "Nuevo", ACCEPTED: "Aceptado", PREPARING: "Preparando", READY: "Listo",
};
const STATUS_NEXT: Record<string, string | null> = {
  CREATED: "ACCEPTED", ACCEPTED: "PREPARING", PREPARING: "READY", READY: "DELIVERED",
  DELIVERED: null, CANCELLED: null,
};
const STATUS_BTN: Record<string, string> = {
  CREATED: "Aceptar", ACCEPTED: "Preparando", PREPARING: "Listo", READY: "Entregado",
};
const CARD_CLS: Record<string, string> = {
  CREATED: "border-yellow-400 bg-yellow-50",
  ACCEPTED: "border-blue-400 bg-blue-50",
  PREPARING: "border-orange-400 bg-orange-50",
  READY: "border-green-400 bg-green-50",
};
const BADGE_CLS: Record<string, string> = {
  CREATED: "bg-yellow-100 text-yellow-800",
  ACCEPTED: "bg-blue-100 text-blue-800",
  PREPARING: "bg-orange-100 text-orange-800",
  READY: "bg-green-100 text-green-800",
};

// ─── OrderCard ─────────────────────────────────────────────
function OrderCard({ order, updating, onStatus }: {
  order: Order; updating: string | null; onStatus: (id: string, status: string) => void;
}) {
  const nextStatus = STATUS_NEXT[order.status];
  const busy = updating === order.id;
  const isNew = Date.now() - new Date(order.createdAt).getTime() < 120_000;
  return (
    <div className={`relative rounded-2xl border-2 p-4 ${CARD_CLS[order.status] ?? "border-zinc-700 bg-zinc-800"}`}>
      {isNew && (
        <span className="absolute -top-2 -right-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white animate-pulse">
          NUEVO
        </span>
      )}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-xs text-zinc-500">{order.id.slice(0, 8).toUpperCase()}</div>
          <div className="text-lg font-bold text-zinc-900">{order.customerName}</div>
          <div className="text-sm text-zinc-600">{order.customerPhone}</div>
        </div>
        <div className="shrink-0 text-right">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE_CLS[order.status] ?? ""}`}>
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
          <div className="mt-1 text-xs text-zinc-500">{timeAgo(order.createdAt)}</div>
          <div className="text-xs text-zinc-500">{order.channel === "DELIVERY" ? "Delivery" : "Recogida"}</div>
        </div>
      </div>
      <div className="mb-3 space-y-1">
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm text-zinc-700">
            <span>{item.quantity}x {item.productName}</span>
            <span>{toEuros(item.lineTotalCents)}</span>
          </div>
        ))}
      </div>
      {order.customerAddress && (
        <div className="mb-2 text-xs text-zinc-500">📍 {order.customerAddress}</div>
      )}
      {order.notes && (
        <div className="mb-2 text-xs italic text-zinc-500">💬 {order.notes}</div>
      )}
      <div className="flex items-center justify-between">
        <span className="font-bold text-zinc-900">{toEuros(order.totalCents)}</span>
        {nextStatus && STATUS_BTN[order.status] && (
          <button
            disabled={busy}
            onClick={() => onStatus(order.id, nextStatus)}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-zinc-700 transition-colors"
          >
            {busy ? "..." : STATUS_BTN[order.status]}
          </button>
        )}
        {order.status === "DELIVERED" && (
          <span className="text-xs text-green-600 font-semibold">✓ Entregado</span>
        )}
      </div>
    </div>
  );
}

// ─── TAB: Carta (gestión de productos) ─────────────────────
function TabCarta({ tenant, categories, onRefresh }: {
  tenant: string; categories: Category[]; onRefresh: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string>("");
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProductCategoryId, setNewProductCategoryId] = useState<string>("");

  const emptyForm = { name: "", description: "", basePriceCents: 0, imageUrl: "", isActive: true, isAvailable: true, isFeatured: false };
  const [form, setForm] = useState(emptyForm);

  function openEdit(product: Product, categoryId: string) {
    setEditingProduct(product);
    setEditingCategoryId(categoryId);
    setForm({
      name: product.name,
      description: product.description ?? "",
      basePriceCents: product.basePriceCents,
      imageUrl: product.imageUrl ?? "",
      isActive: product.isActive,
      isAvailable: product.isAvailable,
      isFeatured: product.isFeatured,
    });
    setShowNewProduct(false);
  }

  function openNew(categoryId: string) {
    setEditingProduct(null);
    setNewProductCategoryId(categoryId);
    setForm(emptyForm);
    setShowNewProduct(true);
  }

  async function saveProduct() {
    setSaving(true);
    setMsg("");
    try {
      const payload = {
        ...form,
        basePriceCents: Number(form.basePriceCents),
        categoryId: editingProduct ? editingCategoryId : newProductCategoryId,
      };
      const url = editingProduct
        ? `/api/admin/${tenant}/products/${editingProduct.id}`
        : `/api/admin/${tenant}/products`;
      const method = editingProduct ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
      setMsg("✅ Guardado");
      setEditingProduct(null);
      setShowNewProduct(false);
      onRefresh();
    } catch (e: unknown) {
      setMsg("❌ Error: " + (e instanceof Error ? e.message : "desconocido"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(productId: string) {
    if (!confirm("¿Eliminar este producto?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/${tenant}/products/${productId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      setMsg("✅ Eliminado");
      onRefresh();
    } catch (e: unknown) {
      setMsg("❌ Error: " + (e instanceof Error ? e.message : "desconocido"));
    } finally {
      setSaving(false);
    }
  }

  const isEditing = editingProduct !== null || showNewProduct;

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`rounded-lg p-3 text-sm font-medium ${msg.startsWith("✅") ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
          {msg}
        </div>
      )}

      {isEditing && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-bold text-zinc-900">
            {editingProduct ? `Editar: ${editingProduct.name}` : "Nuevo producto"}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 uppercase tracking-wide">Nombre *</label>
              <input
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nombre del producto"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 uppercase tracking-wide">Precio (céntimos) *</label>
              <input
                type="number" min={0}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={form.basePriceCents}
                onChange={(e) => setForm({ ...form, basePriceCents: Number(e.target.value) })}
                placeholder="1200 = 12,00 €"
              />
              <div className="mt-1 text-xs text-zinc-500">= {toEuros(Number(form.basePriceCents))}</div>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-zinc-600 uppercase tracking-wide">Descripción</label>
              <textarea
                rows={2}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descripción opcional"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-zinc-600 uppercase tracking-wide">URL imagen</label>
              <input
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                <input type="checkbox" className="h-4 w-4" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Activo
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                <input type="checkbox" className="h-4 w-4" checked={form.isAvailable} onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })} />
                Disponible
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                <input type="checkbox" className="h-4 w-4" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} />
                Destacado
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={saveProduct} disabled={saving}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-zinc-700 transition-colors"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button
              onClick={() => { setEditingProduct(null); setShowNewProduct(false); }}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat.id} className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between bg-zinc-50 px-4 py-3 border-b border-zinc-200">
            <h3 className="font-bold text-zinc-900">{cat.name}</h3>
            <button
              onClick={() => openNew(cat.id)}
              className="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-semibold text-white hover:bg-zinc-700 transition-colors"
            >
              + Añadir producto
            </button>
          </div>
          {cat.products.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-zinc-400">Sin productos en esta categoría</div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {cat.products.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  {p.imageUrl && (
                    <img src={p.imageUrl} alt={p.name} className="h-12 w-12 rounded-lg object-cover shrink-0" />
                  )}
                  {!p.imageUrl && (
                    <div className="h-12 w-12 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0 text-2xl">🍽️</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-900 text-sm truncate">{p.name}</span>
                      {p.isFeatured && <span className="text-xs bg-yellow-100 text-yellow-800 rounded px-1">★</span>}
                      {!p.isActive && <span className="text-xs bg-zinc-200 text-zinc-600 rounded px-1">Inactivo</span>}
                      {!p.isAvailable && <span className="text-xs bg-red-100 text-red-600 rounded px-1">Agotado</span>}
                    </div>
                    <div className="text-xs text-zinc-500 truncate">{p.description}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-bold text-zinc-900 text-sm">{toEuros(p.basePriceCents)}</div>
                    <div className="mt-1 flex gap-2">
                      <button onClick={() => openEdit(p, cat.id)} className="text-xs text-blue-600 hover:underline">Editar</button>
                      <button onClick={() => deleteProduct(p.id)} className="text-xs text-red-600 hover:underline">Eliminar</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── TAB: Personalización ──────────────────────────────────
function TabPersonalizacion({ tenant, tenantData, onRefresh }: {
  tenant: string; tenantData: TenantData; onRefresh: () => void;
}) {
  const branding = tenantData.tenant.branding ?? {};
  const [form, setForm] = useState({
    name: tenantData.tenant.name ?? "",
    primaryColor: (branding.primaryColor as string) ?? "#d62300",
    secondaryColor: (branding.secondaryColor as string) ?? "#502314",
    backgroundColor: (branding.backgroundColor as string) ?? "#ffffff",
    textPrimary: (branding.textPrimary as string) ?? "#502314",
    logoUrl: (branding.logoUrl as string) ?? "",
    heroImageUrl: (branding.heroImageUrl as string) ?? "",
    borderRadius: (branding.borderRadius as string) ?? "10px",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`/api/admin/${tenant}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, branding: {
          primaryColor: form.primaryColor,
          secondaryColor: form.secondaryColor,
          backgroundColor: form.backgroundColor,
          textPrimary: form.textPrimary,
          logoUrl: form.logoUrl || null,
          heroImageUrl: form.heroImageUrl || null,
          borderRadius: form.borderRadius,
        }}),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg("✅ Guardado — recarga la carta para ver los cambios");
      onRefresh();
    } catch (e: unknown) {
      setMsg("❌ Error: " + (e instanceof Error ? e.message : "desconocido"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`rounded-lg p-3 text-sm font-medium ${msg.startsWith("✅") ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
          {msg}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-bold text-zinc-900">Identidad del negocio</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-zinc-600 uppercase tracking-wide">Nombre del negocio</label>
            <input
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-zinc-600 uppercase tracking-wide">URL del logo</label>
            <input
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              value={form.logoUrl}
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              placeholder="https://..."
            />
            {form.logoUrl && <img src={form.logoUrl} alt="Logo" className="mt-2 h-16 object-contain rounded border" />}
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-zinc-600 uppercase tracking-wide">Imagen hero (cabecera carta)</label>
            <input
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              value={form.heroImageUrl}
              onChange={(e) => setForm({ ...form, heroImageUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-bold text-zinc-900">Colores de la marca</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { key: "primaryColor", label: "Color principal (botones, accents)" },
            { key: "secondaryColor", label: "Color secundario (fondo header)" },
            { key: "backgroundColor", label: "Fondo de la carta" },
            { key: "textPrimary", label: "Color del texto principal" },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 uppercase tracking-wide">{label}</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  className="h-10 w-16 rounded cursor-pointer border border-zinc-300"
                  value={(form as Record<string, string>)[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
                <input
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  value={(form as Record<string, string>)[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            </div>
          ))}
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 uppercase tracking-wide">Radio de bordes</label>
            <input
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900"
              value={form.borderRadius}
              onChange={(e) => setForm({ ...form, borderRadius: e.target.value })}
              placeholder="10px"
            />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-zinc-200 p-4">
          <div className="text-xs text-zinc-500 mb-2 font-semibold">Vista previa</div>
          <div className="flex items-center gap-3" style={{ background: form.backgroundColor, padding: "16px", borderRadius: form.borderRadius }}>
            <div style={{ background: form.secondaryColor, color: "#fff", padding: "8px 16px", borderRadius: form.borderRadius, fontSize: "14px", fontWeight: "bold" }}>
              {form.name || "Mi Negocio"}
            </div>
            <button style={{ background: form.primaryColor, color: "#fff", padding: "8px 16px", borderRadius: form.borderRadius, fontSize: "14px", fontWeight: "bold", border: "none", cursor: "pointer" }}>
              Pedir ahora
            </button>
            <span style={{ color: form.textPrimary, fontSize: "14px", fontWeight: "600" }}>Carta del día</span>
          </div>
        </div>
      </div>

      <button
        onClick={save} disabled={saving}
        className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white disabled:opacity-50 hover:bg-zinc-700 transition-colors"
      >
        {saving ? "Guardando..." : "Guardar personalización"}
      </button>
    </div>
  );
}

// ─── TAB: Configuración ────────────────────────────────────
function TabConfiguracion({ tenant, tenantData, onRefresh }: {
  tenant: string; tenantData: TenantData; onRefresh: () => void;
}) {
  const settings = tenantData.tenant.settings ?? {};
  const [form, setForm] = useState({
    deliveryEnabled: (settings.deliveryEnabled as boolean) ?? true,
    takeawayEnabled: (settings.takeawayEnabled as boolean) ?? true,
    minimumOrderCents: (settings.minimumOrderCents as number) ?? 0,
    deliveryFeeCents: (settings.deliveryFeeCents as number) ?? 0,
    estimatedDeliveryMinutes: (settings.estimatedDeliveryMinutes as number) ?? 45,
    estimatedPickupMinutes: (settings.estimatedPickupMinutes as number) ?? 20,
    phone: (settings.phone as string) ?? "",
    whatsapp: (settings.whatsapp as string) ?? "",
    instagram: (settings.instagram as string) ?? "",
    address: (settings.address as string) ?? "",
    currency: (settings.currency as string) ?? "EUR",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`/api/admin/${tenant}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: {
          ...form,
          minimumOrderCents: Number(form.minimumOrderCents),
          deliveryFeeCents: Number(form.deliveryFeeCents),
          estimatedDeliveryMinutes: Number(form.estimatedDeliveryMinutes),
          estimatedPickupMinutes: Number(form.estimatedPickupMinutes),
          phone: form.phone || null,
          whatsapp: form.whatsapp || null,
          instagram: form.instagram || null,
          address: form.address || null,
        }}),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg("✅ Guardado");
      onRefresh();
    } catch (e: unknown) {
      setMsg("❌ Error: " + (e instanceof Error ? e.message : "desconocido"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`rounded-lg p-3 text-sm font-medium ${msg.startsWith("✅") ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
          {msg}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-bold text-zinc-900">Canales de venta</h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 cursor-pointer hover:bg-zinc-50">
            <div>
              <div className="font-semibold text-zinc-900 text-sm">Delivery</div>
              <div className="text-xs text-zinc-500">Envío a domicilio</div>
            </div>
            <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.deliveryEnabled ? "bg-zinc-900" : "bg-zinc-300"}`}>
              <input type="checkbox" className="sr-only" checked={form.deliveryEnabled} onChange={(e) => setForm({ ...form, deliveryEnabled: e.target.checked })} />
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.deliveryEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </div>
          </label>
          <label className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 cursor-pointer hover:bg-zinc-50">
            <div>
              <div className="font-semibold text-zinc-900 text-sm">Recogida en local</div>
              <div className="text-xs text-zinc-500">Takeaway / Click & Collect</div>
            </div>
            <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.takeawayEnabled ? "bg-zinc-900" : "bg-zinc-300"}`}>
              <input type="checkbox" className="sr-only" checked={form.takeawayEnabled} onChange={(e) => setForm({ ...form, takeawayEnabled: e.target.checked })} />
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.takeawayEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </div>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-bold text-zinc-900">Precios y tiempos</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 uppercase tracking-wide">Pedido mínimo (céntimos)</label>
            <input type="number" min={0}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              value={form.minimumOrderCents}
              onChange={(e) => setForm({ ...form, minimumOrderCents: Number(e.target.value) })}
            />
            <div className="mt-1 text-xs text-zinc-500">= {toEuros(Number(form.minimumOrderCents))}</div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 uppercase tracking-wide">Gastos de envío (céntimos)</label>
            <input type="number" min={0}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              value={form.deliveryFeeCents}
              onChange={(e) => setForm({ ...form, deliveryFeeCents: Number(e.target.value) })}
            />
            <div className="mt-1 text-xs text-zinc-500">= {toEuros(Number(form.deliveryFeeCents))}</div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 uppercase tracking-wide">Tiempo delivery (min)</label>
            <input type="number" min={1}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              value={form.estimatedDeliveryMinutes}
              onChange={(e) => setForm({ ...form, estimatedDeliveryMinutes: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 uppercase tracking-wide">Tiempo recogida (min)</label>
            <input type="number" min={1}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              value={form.estimatedPickupMinutes}
              onChange={(e) => setForm({ ...form, estimatedPickupMinutes: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-bold text-zinc-900">Información de contacto</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { key: "phone", label: "Teléfono", placeholder: "+34 600 000 000" },
            { key: "whatsapp", label: "WhatsApp", placeholder: "+34 600 000 000" },
            { key: "instagram", label: "Instagram", placeholder: "@minegocio" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 uppercase tracking-wide">{label}</label>
              <input
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={(form as Record<string, unknown>)[key] as string}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                placeholder={placeholder}
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-zinc-600 uppercase tracking-wide">Dirección del local</label>
            <input
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Calle, número, ciudad"
            />
          </div>
        </div>
      </div>

      <button
        onClick={save} disabled={saving}
        className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white disabled:opacity-50 hover:bg-zinc-700 transition-colors"
      >
        {saving ? "Guardando..." : "Guardar configuración"}
      </button>
    </div>
  );
}

// ─── TAB: Pedidos ──────────────────────────────────────────
function TabPedidos({ tenant }: { tenant: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${tenant}?active=1`, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setOrders(data.orders ?? []);
      setError(null);
    } catch (e: unknown) {
      setError("Error cargando pedidos: " + (e instanceof Error ? e.message : "desconocido"));
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    fetchOrders();
    pollRef.current = setInterval(fetchOrders, 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchOrders]);

  const handleStatus = useCallback(async (orderId: string, nextStatus: string) => {
    setUpdating(orderId);
    try {
      const res = await fetch(`/api/orders/status/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      await fetchOrders();
    } finally {
      setUpdating(null);
    }
  }, [fetchOrders]);

  const active = orders.filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status));
  const done = orders.filter((o) => ["DELIVERED", "CANCELLED"].includes(o.status));

  if (loading) return <div className="text-center py-12 text-zinc-400 text-sm">Cargando pedidos...</div>;
  if (error) return <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <h2 className="text-lg font-bold text-zinc-900">Pedidos activos</h2>
        <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-bold text-white">{active.length}</span>
      </div>

      {active.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-zinc-200 py-16 text-center text-zinc-400">
          <div className="text-4xl mb-3">🎉</div>
          <div className="font-semibold">Sin pedidos activos</div>
          <div className="text-sm mt-1">Los pedidos nuevos aparecerán aquí automáticamente</div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((o) => <OrderCard key={o.id} order={o} updating={updating} onStatus={handleStatus} />)}
        </div>
      )}

      {done.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 text-sm font-semibold text-zinc-500 uppercase tracking-wide">Completados / Cancelados</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 opacity-60">
            {done.slice(0, 6).map((o) => <OrderCard key={o.id} order={o} updating={updating} onStatus={handleStatus} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN: AdminPanel ──────────────────────────────────────
type Tab = "pedidos" | "carta" | "personalizacion" | "configuracion";

export default function AdminPanel({ tenant }: { tenant: string }) {
  const [activeTab, setActiveTab] = useState<Tab>("pedidos");
  const [tenantData, setTenantData] = useState<TenantData | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/${tenant}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setTenantData(data);
    } catch {
      // error silencioso — mostrar skeleton
    } finally {
      setLoadingData(false);
    }
  }, [tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "pedidos", label: "Pedidos", icon: "🛒" },
    { id: "carta", label: "Carta", icon: "📋" },
    { id: "personalizacion", label: "Visual", icon: "🎨" },
    { id: "configuracion", label: "Config", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-4 py-4">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">
              {tenantData?.tenant.name ?? tenant}
            </h1>
            <p className="text-xs text-zinc-500">Panel de administración</p>
          </div>
          <a
            href={`/pedir/${tenant}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Ver carta →
          </a>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-5xl px-4">
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-zinc-900 text-zinc-900"
                    : "border-transparent text-zinc-500 hover:text-zinc-700"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 py-6">
        {activeTab === "pedidos" && <TabPedidos tenant={tenant} />}
        {activeTab !== "pedidos" && loadingData && (
          <div className="text-center py-12 text-zinc-400 text-sm">Cargando datos...</div>
        )}
        {activeTab === "carta" && !loadingData && tenantData && (
          <TabCarta tenant={tenant} categories={tenantData.categories} onRefresh={fetchData} />
        )}
        {activeTab === "personalizacion" && !loadingData && tenantData && (
          <TabPersonalizacion tenant={tenant} tenantData={tenantData} onRefresh={fetchData} />
        )}
        {activeTab === "configuracion" && !loadingData && tenantData && (
          <TabConfiguracion tenant={tenant} tenantData={tenantData} onRefresh={fetchData} />
        )}
      </main>
    </div>
  );
}
