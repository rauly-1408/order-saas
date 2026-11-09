"use client";

import { useEffect, useMemo, useState } from "react";
import { ui, type Lang } from "@/app/lib/i18n";

// Reserva en tres pasos en una sola pantalla: personas, día y hora, y datos.
// Usa las CSS vars del tema del restaurante. Ver docs/RESERVAS.md
type Slot = { at: string; time: string; available: boolean };
type Props = { tenant: string; name: string; logoUrl: string | null; cssVars: Record<string, string>; lang: Lang; enabled: boolean; storeId: string | null; maxGuests: number; note: string; days: string[]; phone: string | null };

const pill = (on: boolean) =>
  `p-press shrink-0 rounded-2xl border-2 px-4 py-2.5 text-[15px] font-bold ${on ? "border-[var(--brand-accent)] bg-[var(--brand-accent)] text-[var(--on-accent)]" : "border-[var(--border)] bg-[var(--surface-0)] text-[var(--text-primary)]"}`;
const field = "mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-0)] px-3.5 py-3 text-[16px] text-[var(--text-primary)] outline-none focus:border-[var(--brand-accent)]";

export default function ReservarClient(p: Props) {
  const T = ui(p.lang);
  const [guests, setGuests] = useState(2);
  const [day, setDay] = useState(p.days[0]);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [at, setAt] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ code: string; status: string } | null>(null);

  useEffect(() => {
    if (!p.enabled) return;
    let alive = true;
    setSlots(null);
    setAt(null);
    fetch(`/api/reservas/${p.tenant}?fecha=${day}&personas=${guests}${p.storeId ? `&local=${p.storeId}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((d) => alive && setSlots(d.slots ?? []))
      .catch(() => alive && setSlots([]));
    return () => {
      alive = false;
    };
  }, [p.tenant, p.enabled, p.storeId, day, guests]);

  const dayLabel = (ymd: string, i: number) => {
    const d = new Date(`${ymd}T12:00:00`);
    const loc = p.lang === "en" ? "en-GB" : "es-ES";
    return { top: i === 0 ? T.bookToday : i === 1 ? T.bookTomorrow : d.toLocaleDateString(loc, { weekday: "short" }), bottom: d.toLocaleDateString(loc, { day: "numeric", month: "short" }) };
  };
  const groups = useMemo(() => {
    const list = slots ?? [];
    return [
      { title: T.bookMorning, items: list.filter((s) => Number(s.time.slice(0, 2)) < 12) },
      { title: T.bookLunch, items: list.filter((s) => Number(s.time.slice(0, 2)) >= 12 && Number(s.time.slice(0, 2)) < 17) },
      { title: T.bookDinner, items: list.filter((s) => Number(s.time.slice(0, 2)) >= 17) },
    ].filter((g) => g.items.length);
  }, [slots, T]);
  const chosen = slots?.find((s) => s.at === at) ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!at) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/reservas/${p.tenant}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ at, guests, ...form, storeId: p.storeId, lang: p.lang }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "No se pudo reservar");
      setDone(d);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reservar");
    } finally {
      setBusy(false);
    }
  }

  const when = chosen ? `${new Date(chosen.at).toLocaleDateString(p.lang === "en" ? "en-GB" : "es-ES", { weekday: "long", day: "numeric", month: "long" })} · ${chosen.time}` : "";

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]" style={{ ...(p.cssVars as React.CSSProperties), fontFamily: p.cssVars["--font-body"] }}>
      <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-0)] px-4 sm:px-8">
        <a href={`/pedir/${p.tenant}`} className="p-press flex h-11 w-11 items-center justify-center rounded-full bg-black/[0.05] text-[20px] no-underline text-[var(--text-primary)]" aria-label={T.backToMenu}>
          ‹
        </a>
        {/* eslint-disable-next-line @next/next/no-img-element -- logo del restaurante, cualquier tamaño */}
        {p.logoUrl ? <img src={p.logoUrl} alt={p.name} className="h-9 w-auto max-w-[150px] object-contain" /> : <span className="truncate text-[16px] font-semibold">{p.name}</span>}
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6">
        {done ? (
          <section className="rounded-[26px] bg-[var(--surface-0)] p-6 text-center shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:p-8" role="status">
            <p className="text-[44px]" aria-hidden>{done.status === "PENDING" ? "🕓" : "✅"}</p>
            <h1 className="mt-2 text-[28px] font-bold">{done.status === "PENDING" ? T.bookPending : T.bookDone}</h1>
            <p className="mt-2 text-[17px] font-semibold first-letter:uppercase">{when}</p>
            <p className="text-[15px] text-[var(--text-secondary)]">{T.bookPeopleN(guests)} · {form.name}</p>
            <p className="mt-4 text-[15px]">{done.status === "PENDING" ? T.bookPendingText : T.bookSeeYou}</p>
            <a href={`/pedir/${p.tenant}/reserva/${done.code}`} className="p-press mt-6 inline-flex rounded-full bg-[var(--brand-accent)] px-6 py-3.5 text-[15px] font-bold text-[var(--on-accent)] no-underline">
              {T.bookViewLink}
            </a>
          </section>
        ) : !p.enabled ? (
          <section className="rounded-[26px] bg-[var(--surface-0)] p-6 text-center sm:p-8">
            <h1 className="text-[26px] font-bold">{T.bookTitle}</h1>
            <p className="mt-3 text-[16px] text-[var(--text-secondary)]">{T.bookClosed}</p>
            {p.phone && <p className="mt-4 text-[17px] font-bold">{T.bookCallUs}: <span className="select-all">{p.phone}</span></p>}
          </section>
        ) : (
          <form onSubmit={submit} className="space-y-8">
            <div>
              <h1 className="text-[30px] font-bold leading-tight sm:text-[38px]">{T.bookTitle}</h1>
              {p.note && <p className="mt-2 text-[15px] text-[var(--text-secondary)]">{p.note}</p>}
            </div>

            <section aria-labelledby="b-people">
              <h2 id="b-people" className="mb-3 text-[18px] font-bold">{T.bookPeople}</h2>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: p.maxGuests }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" onClick={() => setGuests(n)} aria-pressed={guests === n} className={`${pill(guests === n)} min-w-12`}>
                    {n}
                  </button>
                ))}
              </div>
              {p.phone && <p className="mt-2 text-[13px] text-[var(--text-secondary)]">{T.bookMore(p.maxGuests)}: <span className="select-all font-semibold">{p.phone}</span></p>}
            </section>

            <section aria-labelledby="b-day">
              <h2 id="b-day" className="mb-3 text-[18px] font-bold">{T.bookDay}</h2>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
                {p.days.map((d, i) => {
                  const l = dayLabel(d, i);
                  return (
                    <button key={d} type="button" onClick={() => setDay(d)} aria-pressed={day === d} className={`${pill(day === d)} flex w-[76px] flex-col items-center leading-tight`}>
                      <span className="text-[13px] capitalize">{l.top}</span>
                      <span className="text-[15px]">{l.bottom}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="b-time" aria-live="polite">
              <h2 id="b-time" className="mb-3 text-[18px] font-bold">{T.bookTime}</h2>
              {slots === null ? (
                <p className="text-[15px] text-[var(--text-secondary)]">{T.bookLoading}</p>
              ) : groups.length === 0 ? (
                <p className="rounded-2xl bg-[var(--surface-0)] px-4 py-4 text-[15px] text-[var(--text-secondary)]">{T.bookNoSlots}</p>
              ) : (
                <div className="space-y-4">
                  {groups.map((g) => (
                    <div key={g.title}>
                      <p className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{g.title}</p>
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                        {g.items.map((s) => (
                          <button key={s.at} type="button" disabled={!s.available} onClick={() => setAt(s.at)} aria-pressed={at === s.at} className={`${pill(at === s.at)} px-0 tabular-nums disabled:cursor-not-allowed disabled:opacity-35 disabled:line-through`}>
                            {s.time}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {at && (
              <section aria-labelledby="b-data" className="space-y-3 rounded-[26px] bg-[var(--surface-0)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:p-6">
                <h2 id="b-data" className="text-[18px] font-bold">{T.bookYourData}</h2>
                <p className="text-[15px] font-semibold text-[var(--text-secondary)] first-letter:uppercase">{when} · {T.bookPeopleN(guests)}</p>
                <label className="block text-[14px] font-semibold">
                  {T.yourName}
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" className={field} />
                </label>
                <label className="block text-[14px] font-semibold">
                  {T.phone}
                  <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" autoComplete="tel" placeholder="6XX XXX XXX" className={field} />
                </label>
                <label className="block text-[14px] font-semibold">
                  {T.bookEmailOpt}
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" className={field} />
                </label>
                <label className="block text-[14px] font-semibold">
                  {T.bookNotes}
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value.slice(0, 300) })} rows={2} placeholder={T.bookNotesPh} className={field} />
                </label>
                {error && <p className="text-[14px] font-semibold text-red-600" role="alert">{error}</p>}
                <button type="submit" disabled={busy} className="p-press w-full rounded-full bg-[var(--brand-accent)] py-4 text-[16px] font-bold text-[var(--on-accent)] disabled:opacity-60">
                  {busy ? T.bookSending : `${T.bookConfirm} · ${T.bookPeopleN(guests)}`}
                </button>
              </section>
            )}
          </form>
        )}
      </main>
    </div>
  );
}
