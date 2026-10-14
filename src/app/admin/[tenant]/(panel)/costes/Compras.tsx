"use client";

import { useMemo, useState } from "react";
import { deliveryDateText, deliverySummary, mailtoLink, priceChangePct, suggestedOrderQty, supplierMessage, supplierWhatsapp, whatsappLink } from "@/app/lib/purchasing";
import { nextDeliveryText } from "./Proveedores";
import { UNIT_LABEL, euros, formatQty, type Ingredient, type Overview, type PurchaseOrder, type PurchaseStatus, type Supplier } from "./types";

type Props = { data: Overview; api: string; onSaved: () => Promise<void> };
type DraftLine = { ingredientId: string; quantity: string };

const STATUS: Record<PurchaseStatus, { label: string; cls: string }> = {
  DRAFT: { label: "Borrador", cls: "bg-[var(--p-bg)] text-[var(--p-muted)]" },
  SENT: { label: "Enviado", cls: "bg-sky-50 text-sky-700" },
  RECEIVED: { label: "Recibido", cls: "bg-emerald-50 text-emerald-700" },
  CANCELLED: { label: "Cancelado", cls: "bg-red-50 text-red-600" },
};

const lineCost = (i: Ingredient | undefined, qty: number, packPriceCents?: number) =>
  i && i.packSize > 0 ? (qty / i.packSize) * (packPriceCents ?? i.packPriceCents) : 0;

export default function Compras({ data, api, onSaved }: Props) {
  const ingredients = useMemo(() => new Map(data.ingredients.map((i) => [i.id, i])), [data.ingredients]);
  const suppliers = useMemo(() => new Map(data.suppliers.map((s) => [s.id, s])), [data.suppliers]);
  const [editor, setEditor] = useState<{ supplierId: string; lines: DraftLine[] } | null>(null);

  // Sugerencias: ingredientes controlados por debajo del mínimo, agrupados por proveedor.
  const suggestions = useMemo(() => {
    const bySupplier = new Map<string, DraftLine[]>();
    const orphans: Ingredient[] = [];
    for (const i of data.ingredients) {
      const qty = suggestedOrderQty(i);
      if (qty <= 0) continue;
      if (!i.supplierId) {
        orphans.push(i);
        continue;
      }
      bySupplier.set(i.supplierId, [...(bySupplier.get(i.supplierId) ?? []), { ingredientId: i.id, quantity: String(qty) }]);
    }
    return { bySupplier, orphans };
  }, [data.ingredients]);

  return (
    <div className="space-y-6">
      {/* Sugerencias de pedido */}
      <section className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <h2 className="px-5 pt-4 pb-1 text-[17px] font-semibold">Hay que pedir</h2>
        <p className="px-4 pt-2 text-xs text-[var(--p-muted)]">
          Ingredientes controlados por debajo de su mínimo. Se sugiere reponer hasta el doble del mínimo, en formatos completos.
        </p>
        {suggestions.bySupplier.size === 0 && suggestions.orphans.length === 0 ? (
          <p className="px-4 py-5 text-sm text-[var(--p-muted)]">Nada por debajo del mínimo. Configura mínimos en la pestaña Inventario.</p>
        ) : (
          <ul className="divide-y divide-[var(--p-line)]">
            {[...suggestions.bySupplier].map(([supplierId, lines]) => (
              <li key={supplierId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-semibold">{suppliers.get(supplierId)?.name}</div>
                  <div className="text-xs text-[var(--p-muted)]">
                    {lines.map((l) => `${ingredients.get(l.ingredientId)?.name} ${formatQty(Number(l.quantity), ingredients.get(l.ingredientId)!.baseUnit)}`).join(" · ")}
                  </div>
                </div>
                <button onClick={() => setEditor({ supplierId, lines })} className="p-press rounded-full bg-[var(--p-brand)] px-3 py-1.5 text-sm font-semibold text-white">
                  Preparar pedido
                </button>
              </li>
            ))}
            {suggestions.orphans.length > 0 && (
              <li className="px-4 py-3 text-xs text-amber-700">
                Sin proveedor asignado: {suggestions.orphans.map((i) => i.name).join(", ")}. Asígnalo en Ingredientes.
              </li>
            )}
          </ul>
        )}
      </section>

      {editor ? (
        <PurchaseEditor
          data={data}
          initial={editor}
          api={api}
          onClose={() => setEditor(null)}
          onCreated={async () => {
            setEditor(null);
            await onSaved();
          }}
        />
      ) : (
        <button
          onClick={() => setEditor({ supplierId: data.suppliers[0]?.id ?? "", lines: [{ ingredientId: "", quantity: "" }] })}
          disabled={data.suppliers.length === 0}
          className="p-press rounded-full border border-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-[var(--p-brand)] disabled:opacity-40"
        >
          + Nuevo pedido a proveedor
        </button>
      )}

      {/* Pedidos */}
      <section className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <h2 className="px-5 pt-4 pb-1 text-[17px] font-semibold">Pedidos a proveedores</h2>
        {data.purchaseOrders.length === 0 ? (
          <p className="px-4 py-5 text-sm text-[var(--p-muted)]">Todavía no has hecho pedidos.</p>
        ) : (
          <ul className="divide-y divide-[var(--p-line)]">
            {data.purchaseOrders.map((po) => (
              <PurchaseRow key={po.id} po={po} supplier={suppliers.get(po.supplierId)} ingredients={ingredients} restaurant={data.restaurantName} api={api} onSaved={onSaved} />
            ))}
          </ul>
        )}
      </section>

      {/* Historial de precios */}
      <section className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <h2 className="px-5 pt-4 pb-1 text-[17px] font-semibold">Cambios de precio de compra</h2>
        {data.priceChanges.length === 0 ? (
          <p className="px-4 py-5 text-sm text-[var(--p-muted)]">Sin cambios registrados. Se apuntan al editar un precio o al recibir un pedido con otro precio.</p>
        ) : (
          <ul className="divide-y divide-[var(--p-line)]">
            {data.priceChanges.map((c) => {
              const ing = ingredients.get(c.ingredientId);
              const pct = priceChangePct(c);
              const dishes = data.categories.flatMap((cat) =>
                cat.products.filter(
                  (p) =>
                    p.recipeLines.some((l) => l.ingredientId === c.ingredientId) ||
                    p.modifierGroups.some((g) => g.group.options.some((o) => o.recipeLines.some((l) => l.ingredientId === c.ingredientId)))
                )
              ).length;
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-semibold">{ing?.name ?? "—"}</span>
                    <div className="text-[11px] text-[var(--p-muted)]">
                      {euros(c.oldPackPriceCents)} → {euros(c.newPackPriceCents)}
                      {c.oldPackSize !== c.newPackSize && " (cambió el formato)"} · {c.source === "RECEIPT" ? "al recibir un pedido" : "editado a mano"} ·{" "}
                      {new Date(c.createdAt).toLocaleDateString("es-ES")}
                      {dishes > 0 && ` · afecta a ${dishes} plato${dishes === 1 ? "" : "s"}`}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${pct > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
                    {pct > 0 ? "+" : ""}
                    {pct.toFixed(1)} %
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function PurchaseEditor({
  data,
  initial,
  api,
  onClose,
  onCreated,
}: {
  data: Overview;
  initial: { supplierId: string; lines: DraftLine[] };
  api: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState(initial.supplierId);
  const [lines, setLines] = useState<DraftLine[]>(initial.lines);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const ingredients = new Map(data.ingredients.map((i) => [i.id, i]));
  // Primero los del proveedor elegido, luego el resto.
  const options = [...data.ingredients].sort((a, b) => Number(b.supplierId === supplierId) - Number(a.supplierId === supplierId) || a.name.localeCompare(b.name, "es"));
  const total = lines.reduce((acc, l) => acc + lineCost(ingredients.get(l.ingredientId), Number(l.quantity.replace(",", ".")) || 0), 0);
  const supplier = data.suppliers.find((s) => s.id === supplierId);
  const summary = supplier ? deliverySummary(supplier) : null;
  const next = supplier ? nextDeliveryText(supplier) : null;
  const belowMin = supplier?.minOrderCents != null && total > 0 && total < supplier.minOrderCents;

  async function create() {
    setSaving(true);
    setError("");
    const body = { supplierId, notes, lines: lines.map((l) => ({ ingredientId: l.ingredientId, quantity: Number(l.quantity.replace(",", ".")) })) };
    const res = await fetch(`${api}/purchases`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "No se pudo crear el pedido");
      return;
    }
    await onCreated();
  }

  return (
    <div className="rounded-2xl bg-[var(--p-surface)] shadow-[0_12px_32px_-14px_rgba(0,0,0,0.22)] p-4 sm:p-6">
      <h3 className="mb-3 font-bold">Nuevo pedido</h3>
      <label className="mb-3 block text-[13px] font-medium text-[var(--p-muted)]">
        Proveedor
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="mt-1 block w-full rounded-lg border border-[var(--p-line)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--p-ink)]">
          {data.suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
      {summary && (
        <p className="-mt-1 mb-3 text-xs text-[var(--p-muted)]">
          {summary}
          {next && <> · si lo envías ahora llega <span className="font-semibold text-[var(--p-ink)]">{next}</span></>}
        </p>
      )}
      <ul className="space-y-2">
        {lines.map((l, idx) => {
          const ing = ingredients.get(l.ingredientId);
          return (
            <li key={idx} className="grid grid-cols-[1fr_100px_auto] items-center gap-2">
              <select
                value={l.ingredientId}
                onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, ingredientId: e.target.value } : x)))}
                className="min-w-0 rounded-lg border border-[var(--p-line)] px-2 py-2 text-sm"
              >
                <option value="">Ingrediente…</option>
                {options.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <input
                  inputMode="decimal"
                  value={l.quantity}
                  onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))}
                  className="w-full min-w-0 rounded-lg border border-[var(--p-line)] px-2 py-2 text-sm"
                />
                <span className="text-xs text-[var(--p-muted)]">{ing ? UNIT_LABEL[ing.baseUnit] : ""}</span>
              </div>
              <button onClick={() => setLines(lines.filter((_, i) => i !== idx))} aria-label="Quitar línea" className="px-1 text-lg text-[var(--p-faint)] hover:text-red-500">×</button>
            </li>
          );
        })}
      </ul>
      <button onClick={() => setLines([...lines, { ingredientId: "", quantity: "" }])} className="mt-3 text-sm font-semibold text-[var(--p-brand)]">+ Añadir ingrediente</button>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas para el proveedor (hora de entrega…)" className="mt-3 block min-h-16 w-full rounded-lg border border-[var(--p-line)] px-3 py-2 text-sm" />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--p-line)] pt-3">
        <span className="text-sm">Coste estimado: <span className="font-bold">{euros(total)}</span></span>
        <span className="flex gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-[var(--p-muted)] hover:bg-[var(--p-bg)]">Cancelar</button>
          <button onClick={create} disabled={saving || !supplierId} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Creando…" : "Crear pedido"}
          </button>
        </span>
      </div>
      {belowMin && supplier?.minOrderCents != null && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {supplier.name} tiene un pedido mínimo de {euros(supplier.minOrderCents)}. Te faltan {euros(supplier.minOrderCents - total)}.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function PurchaseRow({
  po,
  supplier,
  ingredients,
  restaurant,
  api,
  onSaved,
}: {
  po: PurchaseOrder;
  supplier: Supplier | undefined;
  ingredients: Map<string, Ingredient>;
  restaurant: string;
  api: string;
  onSaved: () => Promise<void>;
}) {
  const [receiving, setReceiving] = useState(false);
  const [received, setReceived] = useState(po.lines.map((l) => ({ id: l.id, qty: String(l.quantity), price: (l.packPriceCents / 100).toFixed(2).replace(".", ",") })));
  const [error, setError] = useState("");
  const total = po.lines.reduce((acc, l) => acc + lineCost(ingredients.get(l.ingredientId), l.receivedQuantity ?? l.quantity, l.packPriceCents), 0);
  const open = po.status === "DRAFT" || po.status === "SENT";

  const message = supplierMessage(
    restaurant,
    supplier?.contactName ?? null,
    po.number,
    po.lines.flatMap((l) => {
      const i = ingredients.get(l.ingredientId);
      return i ? [{ name: i.name, quantity: l.quantity, baseUnit: i.baseUnit, packSize: i.packSize }] : [];
    }),
    po.notes,
    po.expectedAt ? deliveryDateText(new Date(po.expectedAt)) : supplier ? nextDeliveryText(supplier) : null
  );
  const waNumber = supplier ? supplierWhatsapp(supplier) : null;
  const wa = waNumber ? whatsappLink(waNumber, message) : null;
  const mail = supplier?.email ? mailtoLink(supplier.email, `Pedido nº ${po.number} — ${restaurant}`, message, supplier.extraEmails) : null;
  const tel = supplier?.phone ? `tel:${supplier.phone.replace(/[^\d+]/g, "")}` : null;
  const preferred = supplier?.orderMethod ?? "WHATSAPP";

  async function act(body: Record<string, unknown>) {
    setError("");
    const res = await fetch(`${api}/purchases/${po.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "No se pudo actualizar");
      return false;
    }
    await onSaved();
    return true;
  }

  // Abrir WhatsApp/email y marcar como enviado.
  function send(link: string) {
    window.open(link, "_blank", "noopener");
    if (po.status === "DRAFT") void act({ action: "send" });
  }

  async function receive() {
    const ok = await act({
      action: "receive",
      lines: received.map((r) => ({ id: r.id, receivedQuantity: Number(r.qty.replace(",", ".")), packPriceCents: Math.round(Number(r.price.replace(",", ".")) * 100) })),
    });
    if (ok) setReceiving(false);
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Nº {po.number} · {supplier?.name ?? "—"}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[po.status].cls}`}>{STATUS[po.status].label}</span>
          </div>
          <div className="text-xs text-[var(--p-muted)]">
            {po.lines.map((l) => {
              const i = ingredients.get(l.ingredientId);
              return i ? `${i.name} ${formatQty(l.receivedQuantity ?? l.quantity, i.baseUnit)}` : "";
            }).join(" · ")}
          </div>
          <div className="text-[11px] text-[var(--p-faint)]">
            {euros(total)} · {new Date(po.createdAt).toLocaleDateString("es-ES")}
            {po.expectedAt && !po.receivedAt && ` · llega el ${deliveryDateText(new Date(po.expectedAt))}`}
            {po.receivedAt && ` · recibido ${new Date(po.receivedAt).toLocaleDateString("es-ES")}`}
          </div>
        </div>
        {open && (
          <div className="flex flex-wrap gap-1.5">
            {/* El método preferido del proveedor va primero y destacado */}
            {[
              { key: "WHATSAPP", link: wa, text: "WhatsApp", strong: "bg-emerald-600 text-white" },
              { key: "EMAIL", link: mail, text: "Email", strong: "bg-[var(--p-brand)] text-white" },
              { key: "PHONE", link: tel, text: "Llamar", strong: "bg-[var(--p-brand)] text-white" },
            ]
              .filter((b) => b.link)
              .sort((a, b) => Number(b.key === preferred) - Number(a.key === preferred))
              .map((b) => (
                <button
                  key={b.key}
                  onClick={() => (b.key === "PHONE" ? (window.location.href = b.link!) : send(b.link!))}
                  className={`p-press rounded-full px-3 py-1 text-xs font-semibold ${b.key === preferred ? b.strong : "border border-[var(--p-line)]"}`}
                >
                  {b.text}
                </button>
              ))}
            {po.status === "DRAFT" && <button onClick={() => act({ action: "send" })} className="rounded-lg border border-[var(--p-line)] px-2.5 py-1 text-xs">Marcar enviado</button>}
            <button onClick={() => setReceiving(!receiving)} className="p-press rounded-full bg-[var(--p-brand)] px-2.5 py-1 text-xs font-semibold text-white">Recibir</button>
            <button onClick={() => window.confirm(`¿Cancelar el pedido nº ${po.number}?`) && act({ action: "cancel" })} className="rounded-lg px-2.5 py-1 text-xs text-[var(--p-faint)] hover:text-red-500">Cancelar</button>
          </div>
        )}
      </div>
      {open && !wa && !mail && <p className="mt-1 text-[11px] text-amber-700">Añade teléfono o email al proveedor para enviarle el pedido desde aquí.</p>}

      {receiving && (
        <div className="mt-3 rounded-lg bg-[var(--p-bg)] p-3">
          <p className="mb-2 text-sm font-semibold">¿Qué ha llegado?</p>
          <p className="mb-2 text-[11px] text-[var(--p-muted)]">Corrige cantidades o precios si no coinciden con el albarán. Un precio distinto actualiza el ingrediente y queda en el historial.</p>
          <ul className="space-y-2">
            {received.map((r, idx) => {
              const line = po.lines[idx];
              const i = ingredients.get(line.ingredientId);
              return (
                <li key={r.id} className="grid grid-cols-[1fr_90px_120px] items-center gap-2 text-sm">
                  <span className="min-w-0 truncate">{i?.name}</span>
                  <label className="flex items-center gap-1">
                    <input inputMode="decimal" value={r.qty} onChange={(e) => setReceived(received.map((x, k) => (k === idx ? { ...x, qty: e.target.value } : x)))} className="w-full min-w-0 rounded-lg border border-[var(--p-line)] bg-white px-2 py-1.5" />
                    <span className="text-xs text-[var(--p-muted)]">{i ? UNIT_LABEL[i.baseUnit] : ""}</span>
                  </label>
                  <label className="flex items-center gap-1">
                    <input inputMode="decimal" value={r.price} onChange={(e) => setReceived(received.map((x, k) => (k === idx ? { ...x, price: e.target.value } : x)))} className="w-full min-w-0 rounded-lg border border-[var(--p-line)] bg-white px-2 py-1.5" />
                    <span className="text-xs text-[var(--p-muted)]">€/{i ? `${i.packSize} ${UNIT_LABEL[i.baseUnit]}` : "formato"}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex gap-2">
            <button onClick={receive} className="p-press rounded-full bg-[var(--p-brand)] px-3 py-1.5 text-sm font-semibold text-white">Confirmar recepción</button>
            <button onClick={() => setReceiving(false)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--p-muted)] hover:bg-white">Cancelar</button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </li>
  );
}
