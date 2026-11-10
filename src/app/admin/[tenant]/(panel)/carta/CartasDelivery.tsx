"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ask } from "@/app/lib/dialog";
import { BTN } from "../buttons";

// Carta → «Cartas delivery»: cartas con precios a mano para las plataformas de
// reparto. Se crean desde los precios del local o duplicando otra, y cada una
// se asigna a las plataformas que quieras (cada plataforma usa una sola carta).
// Se guarda solo. Ver docs/REPARTO-PLATAFORMAS.md
type Platform = { key: "glovo" | "ubereats" | "justeat"; label: string; added: boolean };
type List = { id: string; name: string; channels: string[]; prices: Record<string, number>; hidden: string[] };
type Category = { id: string; name: string; products: { id: string; name: string; basePriceCents: number; isActive: boolean }[] };
type Data = { platforms: Platform[]; lists: List[]; categories: Category[] };

const euros = (c: number) => (c / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toCents = (v: string): number | null | "bad" => {
  const t = v.trim().replace("€", "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? Math.round(n * 100) : "bad";
};

export default function CartasDelivery({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/cartas-delivery`;
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
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

        <p className="text-sm text-[var(--p-muted)]">Escribe el precio de cada plato en esta carta. Vacío = el mismo que en el local. Quita los platos que no vendes en estas plataformas.</p>
        {data.categories.map((c) => (
          <section key={c.id} className="overflow-hidden rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]" aria-label={c.name}>
            <h3 className="border-b border-[var(--p-line)] px-4 py-2.5 text-sm font-semibold">{c.name}</h3>
            <ul className="divide-y divide-[var(--p-line)]">
              {c.products.map((p) => {
                const offered = !list.hidden.includes(p.id);
                const price = list.prices[p.id];
                return (
                  <li key={p.id} className={`flex items-center gap-3 px-4 py-2.5 ${offered ? "" : "opacity-50"}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block text-xs text-[var(--p-muted)]">Local {euros(p.basePriceCents)} €{!p.isActive && " · oculto en la carta"}</span>
                    </span>
                    <label className="relative block w-24 shrink-0 sm:w-28">
                      <span className="sr-only">Precio de {p.name} en esta carta</span>
                      <input
                        key={`${list.id}-${p.id}-${price ?? "x"}`}
                        defaultValue={price != null ? euros(price) : ""}
                        placeholder={euros(p.basePriceCents)}
                        inputMode="decimal"
                        disabled={!offered}
                        onBlur={(e) => {
                          const v = toCents(e.target.value);
                          if (v === "bad") {
                            setError(`Precio no válido en «${p.name}»`);
                            return;
                          }
                          if (v === (price ?? null)) return;
                          patchList(list.id, (l) => {
                            const prices = { ...l.prices };
                            if (v == null) delete prices[p.id];
                            else prices[p.id] = v;
                            return { ...l, prices };
                          });
                          save(list.id, { productId: p.id, cents: v }, `${p.name}: ${v == null ? "precio del local" : `${euros(v)} €`}`);
                        }}
                        className="w-full rounded-xl bg-black/[0.04] py-2 pl-3 pr-7 text-right text-base tabular-nums outline-none focus:ring-2 focus:ring-[var(--p-brand)]"
                      />
                      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--p-muted)]">€</span>
                    </label>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={offered}
                      aria-label={`${p.name} en esta carta`}
                      onClick={() => {
                        patchList(list.id, (l) => ({ ...l, hidden: offered ? [...l.hidden, p.id] : l.hidden.filter((h) => h !== p.id) }));
                        save(list.id, { productId: p.id, offered: !offered }, offered ? `${p.name} quitado de esta carta` : `${p.name} vuelve a esta carta`);
                      }}
                      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${offered ? "bg-[var(--p-brand)]" : "bg-black/15"}`}
                    >
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${offered ? "left-5" : "left-1"}`} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
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
