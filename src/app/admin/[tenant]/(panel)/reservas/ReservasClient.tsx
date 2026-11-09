"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ask } from "@/app/lib/dialog";
import { Sheet, Stepper } from "../mesas/shared";

// Reservas de un día, por horas: confirmar las pendientes, marcar quién llegó
// o no vino, cancelar y apuntar las que llegan por teléfono. Se refresca sola
// para ver las nuevas de la tienda. Ver docs/RESERVAS.md
type Status = "PENDING" | "CONFIRMED" | "SEATED" | "NO_SHOW" | "CANCELLED" | "WAITLIST";
type Reservation = { id: string; startsAt: string; guests: number; name: string; phone: string; email: string | null; notes: string | null; status: Status; source: "ONLINE" | "PHONE" | "WALKIN"; tableIds: string[]; customerConfirmedAt: string | null; reminderSentAt: string | null };
type Data = { date: string; today: string; tz: string; storeId: string; stores: { id: string; name: string }[]; capacity: number; settings: { enabled: boolean; autoConfirm: boolean; durationMinutes: number }; reservations: Reservation[]; tableNames: Record<string, string> };

const STATUS: Record<Status, { label: string; cls: string }> = {
  PENDING: { label: "Pendiente", cls: "bg-amber-100 text-amber-800" },
  CONFIRMED: { label: "Confirmada", cls: "bg-[var(--p-brand-soft)] text-[var(--p-brand-strong)]" },
  SEATED: { label: "Llegó", cls: "bg-emerald-100 text-emerald-800" },
  NO_SHOW: { label: "No vino", cls: "bg-red-100 text-red-700" },
  CANCELLED: { label: "Cancelada", cls: "bg-black/[0.06] text-[var(--p-muted)]" },
  WAITLIST: { label: "En espera", cls: "bg-amber-100 text-amber-800" },
};
const SOURCE = { ONLINE: "Online", PHONE: "Teléfono", WALKIN: "Sin reserva" };
const POLL_MS = 30_000;
const primary = "p-press inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--p-brand)] px-4 text-sm font-semibold text-white disabled:opacity-50";
const secondary = "p-press inline-flex min-h-11 items-center justify-center rounded-full bg-black/[0.05] px-4 text-sm font-semibold text-[var(--p-ink)] disabled:opacity-50";
const input = "mt-1 w-full rounded-xl border border-[var(--p-line)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--p-brand)]";

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export default function ReservasClient({ tenant, initialDate, canConfigure }: { tenant: string; initialDate: string | null; canConfigure: boolean }) {
  const api = `/api/admin/${tenant}/reservas`;
  const [date, setDate] = useState<string | null>(initialDate);
  const [store, setStore] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [tableFor, setTableFor] = useState<Reservation | null>(null);
  const [notice, setNotice] = useState<{ text: string; link?: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ ...(date && { fecha: date }), ...(store && { local: store }) });
      const res = await fetch(`${api}?${q}`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudieron cargar las reservas");
      setData(d);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las reservas");
    }
  }, [api, date, store]);

  useEffect(() => {
    load();
    const t = setInterval(() => !document.hidden && load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const day = data?.date ?? date;
  const tz = data?.tz;
  const time = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const active = useMemo(() => (data?.reservations ?? []).filter((r) => r.status !== "CANCELLED" && r.status !== "WAITLIST"), [data]);
  const waitlist = (data?.reservations ?? []).filter((r) => r.status === "WAITLIST");
  const cancelled = (data?.reservations ?? []).filter((r) => r.status === "CANCELLED");
  const groups = useMemo(() => {
    const m = new Map<string, Reservation[]>();
    for (const r of active) m.set(time(r.startsAt), [...(m.get(time(r.startsAt)) ?? []), r]);
    return [...m.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tz]);
  const guests = active.filter((r) => r.status !== "NO_SHOW").reduce((a, r) => a + r.guests, 0);
  const pending = active.filter((r) => r.status === "PENDING").length;
  const dayTitle = day
    ? `${day === data?.today ? "Hoy, " : day === (data && addDays(data.today, 1)) ? "Mañana, " : ""}${new Date(`${day}T12:00:00`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}`
    : "";

  async function setStatus(r: Reservation, status: Status, confirmText?: string) {
    if (confirmText && !(await ask(confirmText, { danger: status === "CANCELLED" }))) return;
    setBusy(r.id);
    try {
      const patch = (force: boolean) => fetch(`${api}/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, force }) });
      let res = await patch(false);
      let d = await res.json().catch(() => ({}));
      // Dar mesa a la lista de espera sin sitio: preguntar y forzar.
      if (res.status === 409 && d.full) {
        if (!(await ask(`${d.error}. ¿Dar mesa a ${r.name} igualmente?`, { confirm: "Dar mesa", danger: false }))) return;
        res = await patch(true);
        d = await res.json().catch(() => ({}));
      }
      if (!res.ok) throw new Error(d.error ?? "No se pudo cambiar");
      if (d.opened) setNotice({ text: `Mesa ${d.opened.table} abierta para ${r.name}`, link: true });
      else if (d.notice) setNotice({ text: d.notice, link: true });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-[28px] font-semibold tracking-tight">Reservas</h1>
        {data && data.stores.length > 1 && (
          <select value={data.storeId} onChange={(e) => setStore(e.target.value)} aria-label="Local" className="min-h-11 rounded-full border border-[var(--p-line)] bg-[var(--p-surface)] px-3 text-sm font-medium">
            {data.stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        <button type="button" onClick={() => setAdding(true)} className={primary}>+ Nueva reserva</button>
      </div>

      {/* Día: anterior / hoy / siguiente y calendario */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full bg-black/[0.05] p-1">
          <button type="button" aria-label="Día anterior" disabled={!day} onClick={() => day && setDate(addDays(day, -1))} className="p-press h-10 w-10 rounded-full text-lg font-semibold hover:bg-[var(--p-surface)]">‹</button>
          <button type="button" onClick={() => data && setDate(data.today)} className={`p-press h-10 rounded-full px-4 text-sm font-semibold ${day === data?.today ? "bg-[var(--p-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : ""}`}>Hoy</button>
          <button type="button" aria-label="Día siguiente" disabled={!day} onClick={() => day && setDate(addDays(day, 1))} className="p-press h-10 w-10 rounded-full text-lg font-semibold hover:bg-[var(--p-surface)]">›</button>
        </div>
        <input type="date" value={day ?? ""} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Elegir día" className="min-h-11 rounded-full border border-[var(--p-line)] bg-[var(--p-surface)] px-3 text-sm" />
        <p className="text-[15px] font-semibold first-letter:uppercase">{dayTitle}</p>
      </div>

      {data && !data.settings.enabled && (
        <p className="mt-4 rounded-2xl bg-[var(--p-brand-soft)] px-4 py-3 text-sm text-[var(--p-brand-strong)]">
          Tus clientes todavía no pueden reservar desde la tienda. Puedes apuntar aquí las reservas por teléfono.
          {canConfigure && (
            <>
              {" "}
              <Link href={`/admin/${tenant}/configuracion/reservas`} className="font-semibold underline">Activar las reservas online</Link>
            </>
          )}
        </p>
      )}
      {notice && (
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {notice.text}
          {notice.link && <Link href={`/admin/${tenant}/mesas`} className="font-semibold underline">Ir a Mesas</Link>}
          <button type="button" onClick={() => setNotice(null)} className="ml-auto text-xs font-semibold">Cerrar</button>
        </p>
      )}
      {error && <p className="mt-4 rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]" role="alert">{error}</p>}

      {/* Resumen del día */}
      {data && (
        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          {[
            ["Reservas", String(active.length)],
            ["Comensales", `${guests}`],
            ["Pendientes", String(pending)],
          ].map(([k, v]) => (
            <div key={k} className={`rounded-2xl bg-[var(--p-surface)] px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${k === "Pendientes" && pending > 0 ? "ring-2 ring-amber-300" : ""}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--p-muted)]">{k}</p>
              <p className="text-xl font-semibold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
      )}

      {!data ? (
        !error && <p className="py-16 text-center text-sm text-[var(--p-muted)]">Cargando las reservas…</p>
      ) : active.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--p-line)] bg-[var(--p-surface)]/60 px-6 py-12 text-center">
          <p className="text-lg font-semibold">No hay reservas este día</p>
          <p className="mt-1 text-sm text-[var(--p-muted)]">Las que hagan tus clientes en la tienda aparecen aquí solas.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {groups.map(([t, list]) => (
            <section key={t} aria-label={`${t}`}>
              <h2 className="mb-2 flex items-baseline gap-2 text-lg font-semibold tabular-nums">
                {t}
                <span className="text-sm font-normal text-[var(--p-muted)]">{list.reduce((a, r) => a + r.guests, 0)} pax</span>
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {list.map((r) => (
                  <li key={r.id} className={`rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${r.status === "PENDING" ? "ring-2 ring-amber-300" : ""} ${r.status === "NO_SHOW" ? "opacity-70" : ""}`}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-semibold">{r.name}</p>
                        <p className="text-sm text-[var(--p-muted)]">
                          <span className="font-semibold text-[var(--p-ink)]">{r.guests} {r.guests === 1 ? "persona" : "personas"}</span> · <a href={`tel:${r.phone}`} className="select-all underline-offset-2 hover:underline">{r.phone}</a>
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                    </div>
                    {r.status === "CONFIRMED" && (r.customerConfirmedAt || r.reminderSentAt) && (
                      <p className="mt-2">
                        {r.customerConfirmedAt ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">✓ Confirmó que viene</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-black/[0.05] px-2.5 py-1 text-xs font-semibold text-[var(--p-muted)]">Recordatorio enviado</span>
                        )}
                      </p>
                    )}
                    <p className="mt-2 text-sm font-medium">
                      {r.tableIds.length ? `${r.tableIds.length > 1 ? "Mesas" : "Mesa"} ${r.tableIds.map((id) => data.tableNames[id] ?? "?").join(" + ")}` : <span className="text-amber-700">Sin mesa</span>}
                    </p>
                    {r.notes && <p className="mt-2 rounded-xl bg-[var(--p-warm,#f5f5f7)] px-3 py-2 text-sm">{r.notes}</p>}
                    <p className="mt-2 text-xs text-[var(--p-muted)]">{SOURCE[r.source]}{r.email ? ` · ${r.email}` : ""}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.status === "PENDING" && (
                        <>
                          <button type="button" disabled={busy === r.id} onClick={() => setStatus(r, "CONFIRMED")} className={primary}>Confirmar</button>
                          <button type="button" disabled={busy === r.id} onClick={() => setTableFor(r)} className={secondary}>Mesa</button>
                          <button type="button" disabled={busy === r.id} onClick={() => setStatus(r, "CANCELLED", `¿Rechazar la reserva de ${r.name}?${r.email ? " Le avisaremos por email." : ""}`)} className={secondary}>Rechazar</button>
                        </>
                      )}
                      {r.status === "CONFIRMED" && (
                        <>
                          <button type="button" disabled={busy === r.id} onClick={() => setStatus(r, "SEATED")} className={primary}>Llegó</button>
                          <button type="button" disabled={busy === r.id} onClick={() => setStatus(r, "NO_SHOW")} className={secondary}>No vino</button>
                          <button type="button" disabled={busy === r.id} onClick={() => setTableFor(r)} className={secondary}>Mesa</button>
                          <button type="button" disabled={busy === r.id} onClick={() => setStatus(r, "CANCELLED", `¿Cancelar la reserva de ${r.name}?${r.email ? " Le avisaremos por email." : ""}`)} className={secondary}>Cancelar</button>
                        </>
                      )}
                      {(r.status === "SEATED" || r.status === "NO_SHOW") && (
                        <button type="button" disabled={busy === r.id} onClick={() => setStatus(r, "CONFIRMED")} className={secondary}>Deshacer</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {waitlist.length > 0 && (
        <section className="mt-6" aria-labelledby="r-wait">
          <h2 id="r-wait" className="text-lg font-semibold">Lista de espera ({waitlist.length})</h2>
          <p className="text-sm text-[var(--p-muted)]">Piden mesa a una hora completa. Si se cancela una reserva, les avisamos por email solos.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {waitlist.map((r) => (
              <li key={r.id} className="rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <div className="flex items-start gap-3">
                  <span className="text-lg font-semibold tabular-nums">{time(r.startsAt)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold">{r.name}</p>
                    <p className="text-sm text-[var(--p-muted)]">
                      <span className="font-semibold text-[var(--p-ink)]">{r.guests} {r.guests === 1 ? "persona" : "personas"}</span> · <a href={`tel:${r.phone}`} className="select-all underline-offset-2 hover:underline">{r.phone}</a>
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS.WAITLIST.cls}`}>{STATUS.WAITLIST.label}</span>
                </div>
                {r.notes && <p className="mt-2 rounded-xl bg-[var(--p-warm,#f5f5f7)] px-3 py-2 text-sm">{r.notes}</p>}
                {r.email && <p className="mt-2 text-xs text-[var(--p-muted)]">{r.email}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={busy === r.id} onClick={() => setStatus(r, "CONFIRMED")} className={primary}>Dar mesa</button>
                  <button type="button" disabled={busy === r.id} onClick={() => setStatus(r, "CANCELLED", `¿Quitar a ${r.name} de la lista de espera?`)} className={secondary}>Quitar</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cancelled.length > 0 && (
        <div className="mt-6">
          <button type="button" onClick={() => setShowCancelled((v) => !v)} aria-expanded={showCancelled} className={secondary}>
            {showCancelled ? "Ocultar" : "Ver"} canceladas ({cancelled.length})
          </button>
          {showCancelled && (
            <ul className="mt-3 divide-y divide-[var(--p-line)] rounded-2xl bg-[var(--p-surface)]">
              {cancelled.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="font-semibold tabular-nums">{time(r.startsAt)}</span>
                  <span className="min-w-0 flex-1 truncate">{r.name} · {r.guests} pax</span>
                  <button type="button" disabled={busy === r.id} onClick={() => setStatus(r, "CONFIRMED")} className={secondary}>Recuperar</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tableFor && (
        <TableSheet
          api={`${api}/${tableFor.id}`}
          r={tableFor}
          onClose={() => setTableFor(null)}
          onSaved={async () => {
            setTableFor(null);
            await load();
          }}
        />
      )}
      {adding && data && (
        <NewSheet
          api={api}
          storeId={data.storeId}
          date={data.date}
          onClose={() => setAdding(false)}
          onSaved={async (d) => {
            setAdding(false);
            setDate(d);
            await load();
          }}
        />
      )}
    </div>
  );
}

// Apuntar una reserva (teléfono o cliente que llega sin reservar). Si a esa hora
// ya no hay sitio, se puede apuntar igualmente.
function NewSheet({ api, storeId, date, onClose, onSaved }: { api: string; storeId: string; date: string; onClose: () => void; onSaved: (date: string) => Promise<void> }) {
  const [day, setDay] = useState(date);
  const [guests, setGuests] = useState(2);
  const [slots, setSlots] = useState<{ at: string; time: string; free: number; available: boolean }[] | null>(null);
  const [at, setAt] = useState("");
  const [f, setF] = useState({ name: "", phone: "", email: "", notes: "", source: "PHONE" as "PHONE" | "WALKIN" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setSlots(null);
    fetch(`${api}?horas=1&fecha=${day}&personas=${guests}&local=${storeId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => alive && setSlots(d.slots ?? []))
      .catch(() => alive && setSlots([]));
    return () => {
      alive = false;
    };
  }, [api, day, guests, storeId]);
  const chosen = slots?.find((s) => s.at === at);

  async function save(force = false) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeId, at, guests, ...f, force }) });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && d.full && !force) {
        setBusy(false);
        if (await ask(`${d.error}. ¿Apuntarla igualmente?`, { confirm: "Apuntar igualmente" })) return save(true);
        return;
      }
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");
      await onSaved(day);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="Nueva reserva"
      onClose={onClose}
      footer={
        <>
          {error && <p className="mb-2 text-sm text-[var(--p-accent)]" role="alert">{error}</p>}
          <button type="button" disabled={busy || !at || !f.name.trim() || !f.phone.trim()} onClick={() => save()} className="p-press w-full rounded-2xl bg-[var(--p-brand)] py-3 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Guardando…" : chosen ? `Apuntar · ${chosen.time} · ${guests} pax` : "Elige la hora"}
          </button>
        </>
      }
    >
      <div className="flex gap-1 rounded-full bg-black/[0.05] p-1" role="radiogroup" aria-label="Cómo llega">
        {(["PHONE", "WALKIN"] as const).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={f.source === s} onClick={() => setF({ ...f, source: s })} className={`p-press flex-1 rounded-full py-2 text-sm font-semibold ${f.source === s ? "bg-[var(--p-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)]"}`}>
            {s === "PHONE" ? "Por teléfono" : "Llega sin reservar"}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Personas</span>
        <Stepper value={guests} min={1} max={200} onChange={setGuests} label="personas" />
      </div>
      <label className="mt-4 block text-[13px] font-medium text-[var(--p-muted)]">
        Día
        <input type="date" value={day} onChange={(e) => e.target.value && (setDay(e.target.value), setAt(""))} className={input} />
      </label>
      <p className="mt-4 text-[13px] font-medium text-[var(--p-muted)]">Hora</p>
      {slots === null ? (
        <p className="mt-1 text-sm text-[var(--p-muted)]">Buscando horas…</p>
      ) : slots.length === 0 ? (
        <p className="mt-1 text-sm text-[var(--p-muted)]">Ese día el local está cerrado.</p>
      ) : (
        <div className="mt-1 grid grid-cols-4 gap-1.5">
          {slots.map((s) => (
            <button key={s.at} type="button" onClick={() => setAt(s.at)} aria-pressed={at === s.at} title={`${s.free} plazas libres`} className={`p-press rounded-xl py-2 text-sm font-semibold tabular-nums ${at === s.at ? "bg-[var(--p-brand)] text-white" : s.available ? "bg-black/[0.05]" : "bg-red-50 text-red-700"}`}>
              {s.time}
            </button>
          ))}
        </div>
      )}
      {chosen && !chosen.available && <p className="mt-2 text-xs text-red-700">A esa hora solo quedan {chosen.free} plazas.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-[13px] font-medium text-[var(--p-muted)]">
          Nombre
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value.slice(0, 80) })} className={input} />
        </label>
        <label className="block text-[13px] font-medium text-[var(--p-muted)]">
          Teléfono
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.slice(0, 20) })} inputMode="tel" placeholder="6XX XXX XXX" className={input} />
        </label>
      </div>
      <label className="mt-3 block text-[13px] font-medium text-[var(--p-muted)]">
        Email (opcional: le llega la confirmación)
        <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value.slice(0, 120) })} className={input} />
      </label>
      <label className="mt-3 block text-[13px] font-medium text-[var(--p-muted)]">
        Nota (opcional)
        <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value.slice(0, 300) })} placeholder="Cumpleaños, trona, terraza…" className={input} />
      </label>
    </Sheet>
  );
}

// Elegir la mesa de una reserva: primero la sugerida, después el resto de
// mesas y combinaciones libres a esa hora; al final, las que se quedan cortas.
function TableSheet({ api, r, onClose, onSaved }: { api: string; r: Reservation; onClose: () => void; onSaved: () => Promise<void> }) {
  const [options, setOptions] = useState<{ tableIds: string[]; label: string; seats: number; combo: boolean; fits: boolean }[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(api, { cache: "no-store" })
      .then((res) => res.json())
      .then((d) => setOptions(d.options ?? []))
      .catch(() => setError("No se pudieron cargar las mesas"));
  }, [api]);
  const current = r.tableIds.join(",");
  async function pick(tableIds: string[]) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(api, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tableIds }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setBusy(false);
    }
  }
  const fits = (options ?? []).filter((o) => o.fits);
  const short = (options ?? []).filter((o) => !o.fits);
  const row = (o: { tableIds: string[]; label: string; seats: number; combo: boolean }, best: boolean) => (
    <li key={o.tableIds.join(",")}>
      <button type="button" disabled={busy} onClick={() => pick(o.tableIds)} aria-pressed={o.tableIds.join(",") === current} className={`p-press flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm ${o.tableIds.join(",") === current ? "bg-[var(--p-brand)] text-white" : "bg-black/[0.04]"}`}>
        <span className="flex-1 font-semibold">{o.label}</span>
        <span className="text-xs opacity-80">{o.combo ? `hasta ${o.seats}` : `${o.seats} plazas`}</span>
        {best && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Sugerida</span>}
      </button>
    </li>
  );
  return (
    <Sheet
      title={`Mesa para ${r.name} · ${r.guests} pax`}
      onClose={onClose}
      footer={
        <>
          {error && <p className="mb-2 text-sm text-[var(--p-accent)]" role="alert">{error}</p>}
          {r.tableIds.length > 0 && (
            <button type="button" disabled={busy} onClick={() => pick([])} className="p-press w-full rounded-2xl py-3 text-sm font-medium text-[var(--p-accent)] hover:bg-[var(--p-accent-soft)]">Quitar la mesa</button>
          )}
        </>
      }
    >
      {options === null ? (
        <p className="text-sm text-[var(--p-muted)]">Buscando mesas libres…</p>
      ) : options.length === 0 ? (
        <p className="text-sm text-[var(--p-muted)]">No hay mesas libres a esa hora. Crea las mesas en Mesas → Editar mesas.</p>
      ) : (
        <>
          {fits.length > 0 ? <ul className="space-y-1.5">{fits.map((o, i) => row(o, i === 0))}</ul> : <p className="text-sm text-amber-700">Ninguna mesa libre tiene sitio para {r.guests}. Puedes crear una combinación en Mesas → Editar mesas.</p>}
          {short.length > 0 && (
            <>
              <p className="mt-4 mb-1.5 text-[13px] font-medium text-[var(--p-muted)]">Más pequeñas (para juntar a mano)</p>
              <ul className="space-y-1.5">{short.map((o) => row(o, false))}</ul>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
