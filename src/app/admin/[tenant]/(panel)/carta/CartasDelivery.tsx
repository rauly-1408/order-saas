"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ask } from "@/app/lib/dialog";
import { createPortal } from "react-dom";
import { BTN } from "../buttons";
import DeliveryItemFields, { parseEurosOrNull, type DeliveryItem } from "./DeliveryItemFields";

// Carta → «Cartas delivery»: cartas con precios a mano para las plataformas de
// reparto. Se crean desde los precios del local o duplicando otra, y cada una
// se asigna a las plataformas que quieras (cada plataforma usa una sola carta).
// Se guarda solo. Ver docs/REPARTO-PLATAFORMAS.md
type Platform = { key: "glovo" | "ubereats" | "justeat"; label: string; added: boolean };
type List = { id: string; name: string; channels: string[]; prices: Record<string, number>; descriptions: Record<string, string>; images: Record<string, string>; hidden: string[] };
type Product = { id: string; name: string; description: string | null; imageUrl: string | null; basePriceCents: number; isActive: boolean };
type Category = { id: string; name: string; products: Product[] };
type Data = { platforms: Platform[]; lists: List[]; categories: Category[] };

const euros = (c: number) => (c / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CartasDelivery({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/cartas-delivery`;
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [find, setFind] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set()); // categorías abiertas (plegadas al entrar)
  const [itemFor, setItemFor] = useState<Product | null>(null); // plato abierto en la ficha
  const queue = useRef(Promise.resolve());

  const load = useCallback(async () => {
    const r = await fetch(api, { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setError(d.error ?? "No se pudieron cargar las cartas");
    setData(d);
  }, [api]);
  useEffect(() => {
    let alive = true;
    fetch(api, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) setError(d.error ?? "No se pudieron cargar las cartas");
        else setData(d);
      })
      .catch(() => alive && setError("No se pudieron cargar las cartas"));
    return () => {
      alive = false;
    };
  }, [api]);

  // Los cambios se guardan de uno en uno, en orden.
  function save(id: string, body: Record<string, unknown>, ok = "Guardado") {
    setStatus("Guardando…");
    queue.current = queue.current.then(async () => {
      try {
        const r = await fetch(`${api}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "No se pudo guardar");
        setStatus(`✓ ${ok}`);
        setError("");
      } catch (e) {
        setStatus("");
        setError(e instanceof Error ? e.message : "No se pudo guardar");
        await load();
      }
    });
  }
  const patchList = (id: string, fn: (l: List) => List) => setData((d) => (d ? { ...d, lists: d.lists.map((l) => (l.id === id ? fn(l) : l)) } : d));

  async function create(copyFrom?: List) {
    setBusy(true);
    setError("");
    try {
      const name = copyFrom ? `${copyFrom.name} (copia)` : `Carta delivery ${(data?.lists.length ?? 0) + 1}`;
      const r = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, copyFrom: copyFrom?.id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "No se pudo crear la carta");
      await load();
      setEditing(d.id);
      setStatus(copyFrom ? "Carta duplicada: cambia lo que quieras" : "Carta creada con los precios del local");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la carta");
    } finally {
      setBusy(false);
    }
  }

  async function remove(l: List) {
    if (!(await ask(`¿Borrar la carta «${l.name}»?${l.channels.length ? " Sus plataformas se quedan sin carta de delivery." : ""}`))) return;
    const r = await fetch(`${api}/${l.id}`, { method: "DELETE" });
    if (!r.ok) return setError("No se pudo borrar la carta");
    setEditing(null);
    await load();
  }

  if (!data) return <p className="py-10 text-center text-sm text-[var(--p-muted)]">{error || "Cargando…"}</p>;
  const label = (k: string) => data.platforms.find((p) => p.key === k)?.label ?? k;
  const added = data.platforms.filter((p) => p.added);
  const list = data.lists.find((l) => l.id === editing);

  // ── Editor de una carta ──
  if (list) {
    const owner = (k: string) => data.lists.find((l) => l.id !== list.id && l.channels.includes(k));
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setEditing(null); setStatus(""); }} className={BTN.back}>‹ Cartas delivery</button>
          <span className="ml-auto text-xs text-[var(--p-muted)]" role="status">{status}</span>
        </div>
        {error && <p className="rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]" role="alert">{error}</p>}
        <section className="rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--p-muted)]" htmlFor="cd-name">Nombre de la carta</label>
          <input
            id="cd-name"
            defaultValue={list.name}
            maxLength={60}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== list.name) {
                patchList(list.id, (l) => ({ ...l, name: v }));
                save(list.id, { name: v });
              }
            }}
            className="mt-1 w-full rounded-xl bg-black/[0.04] px-3 py-2.5 text-lg font-semibold outline-none focus:ring-2 focus:ring-[var(--p-brand)]"
          />
          <p className="mt-4 text-sm font-semibold">¿En qué plataformas se usa?</p>
          {added.length === 0 ? (
            <p className="mt-1 text-sm text-[var(--p-muted)]">
              Todavía no has añadido ninguna plataforma. Pega su enlace en{" "}
              <Link href={`/admin/${tenant}/configuracion/entrega`} className="font-semibold text-[var(--p-brand)] underline">Configuración → Envío y entrega</Link> y aparecerá aquí.
            </p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap gap-2">
                {added.map((p) => {
                  const on = list.channels.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const channels = on ? list.channels.filter((c) => c !== p.key) : [...list.channels, p.key];
                        setData((d) => (d ? { ...d, lists: d.lists.map((l) => (l.id === list.id ? { ...l, channels } : { ...l, channels: on ? l.channels : l.channels.filter((c) => c !== p.key) })) } : d));
                        save(list.id, { channels }, on ? `Quitada de ${p.label}` : `Asignada a ${p.label}`);
                      }}
                      className={`p-press min-h-11 rounded-full border-2 px-4 text-sm font-semibold ${on ? "border-[var(--p-brand)] bg-[var(--p-brand-soft)] text-[var(--p-brand-strong)]" : "border-[var(--p-line)]"}`}
                    >
                      {on ? "✓ " : ""}{p.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-[var(--p-muted)]">
                Cada plataforma usa una sola carta.
                {added.filter((p) => !list.channels.includes(p.key) && owner(p.key)).map((p) => ` ${p.label} usa ahora «${owner(p.key)!.name}».`).join("")}
              </p>
            </>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Buscar un plato" aria-label="Buscar un plato" className="min-h-11 w-full rounded-full bg-[var(--p-surface)] px-4 text-sm outline-none focus:ring-2 focus:ring-[var(--p-brand)] sm:max-w-xs" />
          <p className="text-xs text-[var(--p-muted)]">Toca un plato para cambiar su precio, su foto o su descripción en esta carta, o para quitarlo.</p>
        </div>
        {data.categories.map((c) => {
          const term = find.trim().toLowerCase();
          const items = c.products.filter((p) => !term || p.name.toLowerCase().includes(term));
          if (!items.length) return null;
          const sold = c.products.filter((p) => !list.hidden.includes(p.id)).length;
          const isOpen = !!term || openCats.has(c.id);
          return (
            <section key={c.id} className="overflow-hidden rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpenCats((o) => { const n = new Set(o); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} className="flex min-h-14 w-full items-center gap-3 px-4 text-left">
                <span aria-hidden className={`text-[var(--p-muted)] transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                <span className="flex-1 font-semibold">{c.name}</span>
                <span className="text-xs text-[var(--p-muted)]">{sold} de {c.products.length} se venden</span>
              </button>
              {isOpen && (
                <ul className="divide-y divide-[var(--p-line)] border-t border-[var(--p-line)]">
                  {items.map((p) => {
                    const offered = !list.hidden.includes(p.id);
                    const price = list.prices[p.id] ?? p.basePriceCents;
                    const img = list.images[p.id] || p.imageUrl;
                    const own = [list.images[p.id] && "foto propia", list.descriptions[p.id] && "descripción propia"].filter(Boolean);
                    return (
                      <li key={p.id}>
                        <button type="button" onClick={() => setItemFor(p)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-black/[0.02] ${offered ? "" : "opacity-50"}`}>
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element -- miniatura de la carta
                            <img src={img} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-black/[0.04] object-cover" />
                          ) : (
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--p-brand-soft)] font-semibold text-[var(--p-brand-strong)]">{p.name.charAt(0)}</span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{p.name}</span>
                            <span className="block truncate text-xs text-[var(--p-muted)]">{offered ? (own.length ? own.join(" · ") : list.prices[p.id] != null && list.prices[p.id] !== p.basePriceCents ? `Local ${euros(p.basePriceCents)} €` : "Como en el local") : "No se vende en esta carta"}</span>
                          </span>
                          {offered && <span className={`shrink-0 text-sm font-semibold tabular-nums ${price !== p.basePriceCents ? "text-[var(--p-brand-strong)]" : ""}`}>{euros(price)} €</span>}
                          <span aria-hidden className="text-[var(--p-faint)]">›</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
        {itemFor && (
          <ItemSheet
            tenant={tenant}
            list={list}
            product={itemFor}
            onClose={() => setItemFor(null)}
            onSaved={async () => {
              setItemFor(null);
              setStatus("✓ Guardado");
              await load();
            }}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => create(list)} className={BTN.secondary}>Duplicar esta carta</button>
          <button type="button" onClick={() => remove(list)} className={`${BTN.secondary} text-[var(--p-accent)]`}>Borrar la carta</button>
        </div>
      </div>
    );
  }

  // ── Lista de cartas ──
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--p-muted)]">Las plataformas de reparto suelen llevar otros precios. Crea las cartas que quieras, pon el precio de cada plato a mano y elige en qué plataformas se usa cada una.</p>
      {error && <p className="rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]" role="alert">{error}</p>}
      {added.length === 0 && (
        <p className="rounded-2xl bg-[var(--p-brand-soft)] px-4 py-3 text-sm text-[var(--p-brand-strong)]">
          Aún no has añadido plataformas. Pega el enlace de Glovo, Uber Eats o Just Eat en{" "}
          <Link href={`/admin/${tenant}/configuracion/entrega`} className="font-semibold underline">Configuración → Envío y entrega</Link> para poder asignarles una carta.
        </p>
      )}
      {added.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm">
          {added.map((p) => {
            const l = data.lists.find((x) => x.channels.includes(p.key));
            return (
              <li key={p.key} className={`rounded-full px-3 py-1.5 ${l ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                <b>{p.label}:</b> {l ? l.name : "sin carta"}
              </li>
            );
          })}
        </ul>
      )}
      {data.lists.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--p-line)] bg-[var(--p-surface)]/60 px-6 py-10 text-center">
          <p className="text-lg font-semibold">Todavía no hay cartas de delivery</p>
          <p className="mt-1 text-sm text-[var(--p-muted)]">La primera empieza con los precios del local; luego cambias los que quieras.</p>
          <button type="button" disabled={busy} onClick={() => create()} className={`${BTN.primary} mt-4`}>+ Nueva carta</button>
        </div>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.lists.map((l) => {
              const changed = data.categories.flatMap((c) => c.products).filter((p) => l.prices[p.id] != null && l.prices[p.id] !== p.basePriceCents).length;
              return (
                <li key={l.id} className="rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  <button type="button" onClick={() => setEditing(l.id)} className="block w-full text-left">
                    <p className="text-lg font-semibold">{l.name}</p>
                    <p className="text-sm text-[var(--p-muted)]">
                      {changed} {changed === 1 ? "precio distinto" : "precios distintos"} del local{l.hidden.length ? ` · ${l.hidden.length} ${l.hidden.length === 1 ? "plato quitado" : "platos quitados"}` : ""}
                    </p>
                    <p className="mt-2 flex flex-wrap gap-1.5">
                      {l.channels.length ? l.channels.map((c) => <span key={c} className="rounded-full bg-[var(--p-brand-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--p-brand-strong)]">{label(c)}</span>) : <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-xs text-[var(--p-muted)]">Sin plataforma</span>}
                    </p>
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setEditing(l.id)} className={BTN.primary}>Editar</button>
                    <button type="button" disabled={busy} onClick={() => create(l)} className={BTN.secondary}>Duplicar</button>
                  </div>
                </li>
              );
            })}
          </ul>
          <button type="button" disabled={busy} onClick={() => create()} className={BTN.add}>+ Nueva carta</button>
        </>
      )}
    </div>
  );
}

// Ficha de un plato dentro de una carta: si se vende, su precio, foto y descripción.
function ItemSheet({ tenant, list, product, onClose, onSaved }: { tenant: string; list: List; product: Product; onClose: () => void; onSaved: () => Promise<void> }) {
  const [item, setItem] = useState<DeliveryItem & { priceText?: string }>({
    id: list.id,
    name: list.name,
    channels: list.channels,
    offered: !list.hidden.includes(product.id),
    priceCents: list.prices[product.id] ?? null,
    description: list.descriptions[product.id] ?? "",
    imageUrl: list.images[product.id] ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [portal, setPortal] = useState<Element | null>(null);
  useEffect(() => setPortal(document.querySelector(".panel") ?? document.body), []);
  async function save() {
    if (item.offered && item.priceText && parseEurosOrNull(item.priceText) === "bad") return setError("Escribe el precio en euros, por ejemplo 6,90, o déjalo vacío.");
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/${tenant}/products/${product.id}/cartas`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lists: [{ id: list.id, offered: item.offered, priceCents: item.priceCents, description: item.description, imageUrl: item.imageUrl }] }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar");
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setBusy(false);
    }
  }
  if (!portal) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`${product.name} en ${list.name}`}>
      <button type="button" aria-label="Cerrar" onClick={() => !busy && onClose()} className="absolute inset-0 bg-black/40" />
      <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[24px] bg-[var(--p-surface)] text-[var(--p-ink)] sm:max-w-lg sm:rounded-[24px]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--p-line)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{product.name}</h2>
            <p className="truncate text-xs text-[var(--p-muted)]">En «{list.name}» · en el local {euros(product.basePriceCents)} €</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full px-3 py-1 text-sm text-[var(--p-muted)] hover:bg-black/[0.05]">Cerrar</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <DeliveryItemFields tenant={tenant} item={item} showName={false} local={{ priceCents: product.basePriceCents, description: product.description ?? "", imageUrl: product.imageUrl ?? "" }} onChange={(patch) => setItem((x) => ({ ...x, ...patch }))} />
          {error && <p className="mt-3 text-sm text-[var(--p-accent)]" role="alert">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--p-line)] px-5 py-3">
          <button type="button" onClick={onClose} disabled={busy} className={BTN.secondary}>Cancelar</button>
          <button type="button" onClick={save} disabled={busy} className={BTN.primary}>{busy ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </div>,
    portal
  );
}
