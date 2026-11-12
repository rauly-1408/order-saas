"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ask } from "@/app/lib/dialog";
import { Sheet, Stepper } from "../mesas/shared";
import TimeWheel from "./TimeWheel";

// Reservas: tira de días arriba (con cuántas tiene cada uno), el día en una
// línea y las reservas en grupos (por confirmar, por llegar, en el local,
// lista de espera). Cada fila tiene su acción principal en un botón grande y,
// al tocarla, una ficha con todo. Se refresca sola. Ver docs/RESERVAS.md
type Status = "PENDING" | "CONFIRMED" | "SEATED" | "NO_SHOW" | "CANCELLED" | "WAITLIST";
type Reservation = { id: string; startsAt: string; guests: number; name: string; phone: string; email: string | null; notes: string | null; status: Status; source: "ONLINE" | "PHONE" | "WALKIN"; tableIds: string[]; customerConfirmedAt: string | null; reminderSentAt: string | null; isNew?: boolean };
type Data = { date: string; today: string; days: Record<string, { count: number; guests: number; pending: number }>; tz: string; storeId: string; stores: { id: string; name: string }[]; capacity: number; settings: { enabled: boolean; autoConfirm: boolean; durationMinutes: number }; reservations: Reservation[]; tableNames: Record<string, string> };

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
  const [showDone, setShowDone] = useState(false);
  const [open, setOpen] = useState<Reservation | null>(null); // ficha de una reserva
  const [tableFor, setTableFor] = useState<Reservation | null>(null);
  const [notice, setNotice] = useState<{ text: string; link?: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ ...(date && { fecha: date }), ...(store && { local: store }) });
      const res = await fetch(`${api}?${q}`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudieron cargar las reservas");
      setData(d);
      setError("");
      setNow(Date.now());
      window.dispatchEvent(new Event("panel-avisos")); // las nuevas ya se han visto: el menú se actualiza
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
  const all = data?.reservations ?? [];
  const pending = all.filter((r) => r.status === "PENDING");
  const upcoming = all.filter((r) => r.status === "CONFIRMED");
  const seated = all.filter((r) => r.status === "SEATED");
  const waitlist = all.filter((r) => r.status === "WAITLIST");
  const finished = all.filter((r) => r.status === "NO_SHOW" || r.status === "CANCELLED");
  const active = [...pending, ...upcoming, ...seated];
  const guests = active.reduce((a, r) => a + r.guests, 0);
  const isToday = day === data?.today;
  const late = (r: Reservation) => isToday && r.status === "CONFIRMED" && now - new Date(r.startsAt).getTime() > 15 * 60_000;
  const tableText = (r: Reservation) => (r.tableIds.length ? `${r.tableIds.length > 1 ? "Mesas" : "Mesa"} ${r.tableIds.map((id) => data?.tableNames[id] ?? "?").join(" + ")}` : "Sin mesa");
  const dayTitle = day ? new Date(`${day}T12:00:00`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) : "";

  async function setStatus(r: Reservation, status: Status, confirmText?: string) {
    if (confirmText && !(await ask(confirmText, { danger: status === "CANCELLED" || status === "NO_SHOW" }))) return false;
    setBusy(r.id);
    try {
      const patch = (force: boolean) => fetch(`${api}/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, force }) });
      let res = await patch(false);
      let d = await res.json().catch(() => ({}));
      // Dar mesa a la lista de espera sin sitio: preguntar y forzar.
      if (res.status === 409 && d.full) {
        if (!(await ask(`${d.error}. ¿Dar mesa a ${r.name} igualmente?`, { confirm: "Dar mesa", danger: false }))) return false;
        res = await patch(true);
        d = await res.json().catch(() => ({}));
      }
      if (!res.ok) throw new Error(d.error ?? "No se pudo cambiar");
      if (d.opened) setNotice({ text: `${d.opened.table.includes("+") ? "Mesas" : "Mesa"} ${d.opened.table} abierta para ${r.name}`, link: true });
      else if (d.notice) setNotice({ text: d.notice, link: true });
      else if (status === "SEATED") setNotice({ text: `${r.name} ya está en el local. No tenía mesa asignada: ábrele una en Mesas`, link: true });
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar");
      return false;
    } finally {
      setBusy(null);
    }
  }

  // La acción principal de cada reserva, en un botón grande a la derecha.
  function mainAction(r: Reservation) {
    const b = (label: string, onClick: () => void, cls = primary) => (
      <button type="button" disabled={busy === r.id} onClick={(e) => { e.stopPropagation(); onClick(); }} className={`${cls} shrink-0`}>
        {busy === r.id ? "…" : label}
      </button>
    );
    if (r.status === "PENDING") return b("Confirmar", () => setStatus(r, "CONFIRMED"));
    if (r.status === "CONFIRMED") return b("Llegó", () => setStatus(r, "SEATED"));
    if (r.status === "WAITLIST") return b("Dar mesa", () => setStatus(r, "CONFIRMED"));
    return null;
  }

  function Row({ r }: { r: Reservation }) {
    const chips = [
      r.isNew && { t: "Nueva · desde la web", c: "bg-[var(--p-accent)] text-white" },
      r.status === "CONFIRMED" && r.customerConfirmedAt && { t: "✓ Confirmó que viene", c: "bg-emerald-100 text-emerald-800" },
      late(r) && { t: "Llega tarde", c: "bg-red-100 text-red-700" },
      r.notes && { t: "📝 Nota", c: "bg-black/[0.05] text-[var(--p-ink)]" },
    ].filter(Boolean) as { t: string; c: string }[];
    return (
      <li>
        <div role="button" tabIndex={0} onClick={() => setOpen(r)} onKeyDown={(e) => e.key === "Enter" && setOpen(r)} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-black/[0.02] sm:gap-4 sm:px-5">
          <span className={`w-14 shrink-0 text-xl font-semibold tabular-nums ${late(r) ? "text-red-600" : ""}`}>{time(r.startsAt)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold">{r.name}</span>
            <span className="block truncate text-sm text-[var(--p-muted)]">
              <b className="font-semibold text-[var(--p-ink)]">{r.guests} {r.guests === 1 ? "persona" : "personas"}</b> · <span className={r.tableIds.length ? "" : "font-semibold text-amber-700"}>{tableText(r)}</span>
            </span>
            {chips.length > 0 && (
              <span className="mt-1 flex flex-wrap gap-1">
                {chips.map((c) => <span key={c.t} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.c}`}>{c.t}</span>)}
              </span>
            )}
          </span>
          {mainAction(r)}
          <span aria-hidden className="text-lg text-[var(--p-faint)]">›</span>
        </div>
      </li>
    );
  }

  const Group = ({ title, hint, tone, items }: { title: string; hint?: string; tone?: string; items: Reservation[] }) =>
    items.length ? (
      <section className="mt-5">
        <h2 className={`mb-2 flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide ${tone ?? "text-[var(--p-muted)]"}`}>
          {title} <span className="tabular-nums">({items.length})</span>
          {hint && <span className="text-xs font-normal normal-case tracking-normal text-[var(--p-muted)]">{hint}</span>}
        </h2>
        <ul className="divide-y divide-[var(--p-line)] overflow-hidden rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {items.map((r) => <Row key={r.id} r={r} />)}
        </ul>
      </section>
    ) : null;

  const strip = data ? Object.entries(data.days) : [];

  return (
    <div className="mx-auto w-full max-w-4xl">
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

      {/* Tira de días: toca un día; el número es cuántas reservas tiene */}
      <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {strip.map(([ymd, c]) => {
          const d = new Date(`${ymd}T12:00:00`);
          const on = ymd === day;
          const top = ymd === data?.today ? "Hoy" : data && ymd === addDays(data.today, 1) ? "Mañana" : ymd === (data && addDays(data.today, -1)) ? "Ayer" : d.toLocaleDateString("es-ES", { weekday: "short" });
          return (
            <button key={ymd} type="button" onClick={() => setDate(ymd)} aria-pressed={on} className={`p-press relative flex w-[72px] shrink-0 flex-col items-center rounded-2xl px-2 py-2.5 ${on ? "bg-[var(--p-brand)] text-white" : "bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"}`}>
              <span className={`text-xs font-semibold first-letter:uppercase ${on ? "text-white/85" : "text-[var(--p-muted)]"}`}>{top}</span>
              <span className="text-xl font-semibold tabular-nums">{d.getDate()}</span>
              <span className={`text-[11px] tabular-nums ${on ? "text-white/85" : c.count ? "text-[var(--p-ink)]" : "text-[var(--p-faint)]"}`}>{c.count ? `${c.count} res.` : "—"}</span>
              {c.pending > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white" aria-label="Con reservas por confirmar o nuevas" />}
            </button>
          );
        })}
        <label className="p-press relative flex w-[72px] shrink-0 cursor-pointer flex-col items-center justify-center rounded-2xl bg-[var(--p-surface)] px-2 py-2.5 text-xs font-semibold text-[var(--p-muted)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          📅<span className="mt-1">Otro día</span>
          <input type="date" value={day ?? ""} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Elegir otro día" className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      </div>

      {/* El día elegido, en una línea */}
      {data && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="mr-2 text-lg font-semibold first-letter:uppercase">{isToday ? "Hoy, " : ""}{dayTitle}</p>
          <span className="rounded-full bg-[var(--p-surface)] px-3 py-1 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)]"><b className="tabular-nums">{active.length}</b> {active.length === 1 ? "reserva" : "reservas"} · <b className="tabular-nums">{guests}</b> comensales</span>
          {pending.length > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">{pending.length} por confirmar</span>}
          {waitlist.length > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-900">{waitlist.length} en espera</span>}
        </div>
      )}

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

      {!data ? (
        !error && <p className="py-16 text-center text-sm text-[var(--p-muted)]">Cargando las reservas…</p>
      ) : active.length === 0 && waitlist.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--p-line)] bg-white/60 px-6 py-12 text-center">
          <p className="text-lg font-semibold">No hay reservas este día</p>
          <p className="mt-1 text-sm text-[var(--p-muted)]">Las que hagan tus clientes en la tienda aparecen aquí solas.</p>
          <button type="button" onClick={() => setAdding(true)} className={`${primary} mt-4`}>+ Apuntar una reserva</button>
        </div>
      ) : (
        <>
          <Group title="Por confirmar" hint="Acéptalas o recházalas" tone="text-amber-800" items={pending} />
          <Group title={isToday ? "Por llegar" : "Reservas"} items={upcoming} />
          <Group title="En el local" items={seated} />
          <Group title="Lista de espera" hint="Piden mesa a una hora llena; si alguien cancela les avisamos solos" items={waitlist} />
        </>
      )}

      {finished.length > 0 && (
        <div className="mt-6">
          <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className={secondary}>
            {showDone ? "Ocultar" : "Ver"} no vinieron y canceladas ({finished.length})
          </button>
          {showDone && (
            <ul className="mt-3 divide-y divide-[var(--p-line)] overflow-hidden rounded-2xl bg-[var(--p-surface)] opacity-80">
              {finished.map((r) => <Row key={r.id} r={r} />)}
            </ul>
          )}
        </div>
      )}

      {open && (
        <DetailSheet
          r={open}
          time={time(open.startsAt)}
          tableText={tableText(open)}
          busy={busy === open.id}
          onClose={() => setOpen(null)}
          onTable={() => { setTableFor(open); setOpen(null); }}
          onStatus={async (status, text) => { if (await setStatus(open, status, text)) setOpen(null); }}
        />
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

// Ficha de una reserva: todo lo que hay que saber y todas las acciones, grandes.
function DetailSheet({ r, time, tableText, busy, onClose, onTable, onStatus }: { r: Reservation; time: string; tableText: string; busy: boolean; onClose: () => void; onTable: () => void; onStatus: (s: Status, confirmText?: string) => void }) {
  const big = (label: string, onClick: () => void, cls: string) => (
    <button type="button" disabled={busy} onClick={onClick} className={`p-press min-h-12 w-full rounded-2xl px-4 text-base font-semibold disabled:opacity-50 ${cls}`}>{label}</button>
  );
  const P = "bg-[var(--p-brand)] text-white";
  const S = "bg-black/[0.05] text-[var(--p-ink)]";
  const D = "bg-red-50 text-red-700";
  const mail = r.email ? ` Le avisaremos por email.` : "";
  return (
    <Sheet title={`${r.name} · ${time}`} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
        {r.customerConfirmedAt && r.status === "CONFIRMED" && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">✓ Confirmó que viene</span>}
        {r.reminderSentAt && !r.customerConfirmedAt && r.status === "CONFIRMED" && <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-xs text-[var(--p-muted)]">Recordatorio enviado</span>}
        <span className="text-xs text-[var(--p-muted)]">{SOURCE[r.source]}</span>
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-[var(--p-muted)]">Hora</dt><dd className="font-semibold tabular-nums">{time}</dd>
        <dt className="text-[var(--p-muted)]">Personas</dt><dd className="font-semibold">{r.guests}</dd>
        <dt className="text-[var(--p-muted)]">Mesa</dt><dd className="font-semibold">{tableText}</dd>
        <dt className="text-[var(--p-muted)]">Teléfono</dt><dd><a href={`tel:${r.phone}`} className="font-semibold text-[var(--p-brand)]">{r.phone}</a></dd>
        {r.email && (<><dt className="text-[var(--p-muted)]">Email</dt><dd className="truncate">{r.email}</dd></>)}
      </dl>
      {r.notes && <p className="mt-3 rounded-xl bg-[var(--p-warm,#f5f5f7)] px-3 py-2 text-sm">📝 {r.notes}</p>}
      <div className="mt-5 space-y-2">
        {r.status === "PENDING" && (
          <>
            {big("Confirmar la reserva", () => onStatus("CONFIRMED"), P)}
            {big("Cambiar la mesa", onTable, S)}
            {big("Rechazar", () => onStatus("CANCELLED", `¿Rechazar la reserva de ${r.name}?${mail}`), D)}
          </>
        )}
        {r.status === "CONFIRMED" && (
          <>
            {big("Llegó: abrir su mesa", () => onStatus("SEATED"), P)}
            {big("Cambiar la mesa", onTable, S)}
            {big("No vino", () => onStatus("NO_SHOW", `¿Marcar que ${r.name} no vino?`), S)}
            {big("Cancelar la reserva", () => onStatus("CANCELLED", `¿Cancelar la reserva de ${r.name}?${mail}`), D)}
          </>
        )}
        {r.status === "WAITLIST" && (
          <>
            {big("Dar mesa", () => onStatus("CONFIRMED"), P)}
            {big("Quitar de la lista de espera", () => onStatus("CANCELLED", `¿Quitar a ${r.name} de la lista de espera?`), D)}
          </>
        )}
        {(r.status === "SEATED" || r.status === "NO_SHOW") && big("Deshacer", () => onStatus("CONFIRMED"), S)}
        {r.status === "CANCELLED" && big("Recuperar la reserva", () => onStatus("CONFIRMED"), S)}
      </div>
    </Sheet>
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
  // Minuto del día de cada hora libre, para el reloj; se coloca en la primera
  // a partir de ahora (o en la primera del día).
  const minuteOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const open = (slots ?? []).map((x) => minuteOf(x.time));
  useEffect(() => {
    if (!slots?.length || slots.some((x) => x.at === at)) return;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const first = slots.find((x) => minuteOf(x.time) >= nowMin) ?? slots[0];
    setAt(first.at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);
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
        <div className="mt-1">
          <TimeWheel open={open} value={chosen ? minuteOf(chosen.time) : open[0]} onChange={(m) => { const s = slots.find((x) => minuteOf(x.time) === m); if (s) setAt(s.at); }} />
          {chosen && (
            <p className={`mt-2 text-center text-sm ${chosen.available ? "text-[var(--p-muted)]" : "font-semibold text-red-700"}`}>
              {chosen.available ? `A las ${chosen.time} quedan ${chosen.free} plazas` : `A las ${chosen.time} solo quedan ${chosen.free} plazas: se puede apuntar igualmente`}
            </p>
          )}
        </div>
      )}
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
