"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { KitchenTicket, KitchenView } from "@/app/lib/kitchen";

// Pantalla de cocina (KDS): comandas en tarjetas grandes, de la más antigua a
// la más nueva, con el tiempo que llevan en color (verde, ámbar, rojo). Tocar
// una línea la tacha (solo en esta pantalla); «Listo» la quita. Se refresca
// sola y suena cuando entra una comanda nueva. Ver docs/PANTALLA-COCINA.md

const VIEWS: { key: KitchenView; label: string }[] = [
  { key: "TODO", label: "Todo" },
  { key: "COCINA", label: "Cocina" },
  { key: "BARRA", label: "Barra" },
];
const POLL_MS = 5000;

function minutes(iso: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}
function tone(m: number) {
  return m >= 20 ? "bg-red-500 text-white" : m >= 10 ? "bg-amber-400 text-[#111214]" : "bg-emerald-500 text-white";
}

function beep() {
  try {
    const W = window as Window & { webkitAudioContext?: typeof AudioContext };
    const ctx = new (window.AudioContext ?? W.webkitAudioContext!)();
    [880, 1318.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.25, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.55);
    });
  } catch {
    /* sin sonido no pasa nada */
  }
}

export default function KdsClient({ tenant, station }: { tenant: string; station: "COCINA" | "BARRA" | null }) {
  const [view, setView] = useState<KitchenView>(station ?? "TODO");
  const [tickets, setTickets] = useState<KitchenTicket[] | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [done, setDone] = useState<Set<string>>(new Set()); // líneas tachadas en esta pantalla
  const [busy, setBusy] = useState<string | null>(null);
  const [sound, setSound] = useState(false);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    setPortal((document.querySelector(".panel") as HTMLElement | null) ?? document.body);
    try {
      const v = localStorage.getItem("kds-view") as KitchenView | null;
      if (!station && v && VIEWS.some((x) => x.key === v)) setView(v);
      setSound(localStorage.getItem("kds-sound") === "1");
    } catch {}
  }, [station]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/${tenant}/cocina?vista=${view}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { tickets: KitchenTicket[] };
      const keys = new Set(d.tickets.map((t) => t.key));
      if (seen.current && sound && d.tickets.some((t) => !seen.current!.has(t.key))) beep();
      seen.current = keys;
      setTickets(d.tickets);
      setError("");
    } catch {
      setError("Sin conexión: mostrando lo último que llegó");
    }
  }, [tenant, view, sound]);

  useEffect(() => {
    seen.current = null;
    load();
    const t = setInterval(() => !document.hidden && load(), POLL_MS);
    const c = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
  }, [load]);

  async function advance(t: KitchenTicket) {
    setBusy(t.key);
    try {
      const res =
        t.kind === "round"
          ? await fetch(`/api/admin/${tenant}/cocina`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: t.orderId, round: t.round, vista: view }) })
          : await fetch(`/api/orders/status/${t.orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: t.status === "PREPARING" ? "READY" : "PREPARING" }) });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? "No se ha podido marcar. Prueba otra vez.");
        return;
      }
      setTickets((ts) => ts && ts.filter((x) => x.key !== t.key || t.kind === "order" && t.status !== "PREPARING"));
      await load();
    } catch {
      setError("Sin conexión: no se ha podido marcar");
    } finally {
      setBusy(null);
    }
  }

  const toggleLine = (id: string) => setDone((d) => {
    const n = new Set(d);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const title = station === "BARRA" || view === "BARRA" ? "Barra" : station === "COCINA" || view === "COCINA" ? "Cocina" : "Cocina y barra";

  if (!portal) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col bg-[#111214] text-[#f3f3f1]" role="region" aria-label={`Pantalla de ${title.toLowerCase()}`}>
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 sm:px-5">
        <Link href={`/admin/${tenant}/pedidos`} className="flex min-h-11 items-center rounded-full bg-white/10 px-4 text-sm font-semibold">
          ‹ Panel
        </Link>
        <h1 className="mr-auto text-xl font-bold">
          {title}
          {tickets && <span className="ml-2 rounded-full bg-white/10 px-2.5 py-0.5 text-sm font-semibold tabular-nums">{tickets.length}</span>}
        </h1>
        {!station && (
          <div className="flex rounded-full bg-white/10 p-1" role="radiogroup" aria-label="Qué se ve">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                role="radio"
                aria-checked={view === v.key}
                onClick={() => {
                  setView(v.key);
                  try {
                    localStorage.setItem("kds-view", v.key);
                  } catch {}
                }}
                className={`min-h-10 rounded-full px-4 text-sm font-semibold ${view === v.key ? "bg-white text-[#111214]" : "text-white/70"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            const on = !sound;
            setSound(on);
            if (on) beep();
            try {
              localStorage.setItem("kds-sound", on ? "1" : "0");
            } catch {}
          }}
          aria-pressed={sound}
          className={`min-h-11 rounded-full px-4 text-sm font-semibold ${sound ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/70"}`}
        >
          {sound ? "🔔 Sonido activado" : "🔕 Activar sonido"}
        </button>
        <button type="button" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})} className="min-h-11 rounded-full bg-white/10 px-4 text-sm font-semibold">
          Pantalla completa
        </button>
      </header>
      {error && <p className="bg-amber-400 px-4 py-1.5 text-center text-sm font-semibold text-[#111214]" role="status">{error}</p>}

      <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        {!tickets ? (
          <p className="py-20 text-center text-white/60">Cargando comandas…</p>
        ) : tickets.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-6xl">✓</p>
            <p className="mt-3 text-2xl font-bold">Todo al día</p>
            <p className="mt-1 text-white/60">Las comandas nuevas aparecen aquí solas.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] items-start gap-3 sm:gap-4">
            {tickets.map((t) => {
              const m = minutes(t.createdAt, now);
              const isNew = t.kind === "order" && t.status !== "PREPARING";
              return (
                <li key={t.key} className="flex flex-col overflow-hidden rounded-2xl bg-[#1c1d21] ring-1 ring-white/10">
                  <div className={`flex items-start justify-between gap-3 px-4 py-3 ${tone(m)}`}>
                    <div className="min-w-0">
                      <p className="text-xl font-extrabold leading-tight">{t.title}</p>
                      {t.subtitle && <p className="truncate text-sm font-semibold opacity-90">{t.subtitle}</p>}
                    </div>
                    <span className="shrink-0 rounded-full bg-black/20 px-2.5 py-1 text-base font-bold tabular-nums">{m} min</span>
                  </div>
                  <ul className="divide-y divide-white/5">
                    {t.lines.map((l) => {
                      const struck = done.has(l.id);
                      return (
                        <li key={l.id}>
                          <button type="button" onClick={() => toggleLine(l.id)} aria-pressed={struck} className={`flex min-h-14 w-full items-start gap-3 px-4 py-2.5 text-left ${struck ? "opacity-40" : ""}`}>
                            <span className="w-9 shrink-0 text-2xl font-extrabold tabular-nums">{l.quantity}×</span>
                            <span className="min-w-0 flex-1">
                              <span className={`block text-lg font-bold leading-snug ${struck ? "line-through" : ""}`}>{l.name}</span>
                              {l.modifiers.length > 0 && <span className="block text-sm text-white/70">{l.modifiers.join(" · ")}</span>}
                              {l.note && <span className="mt-0.5 block text-base font-bold text-amber-300 wrap-anywhere">» {l.note}</span>}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    type="button"
                    disabled={busy === t.key}
                    onClick={() => advance(t)}
                    className={`m-3 min-h-16 rounded-xl text-lg font-extrabold disabled:opacity-50 ${isNew ? "bg-white/10 text-white" : "bg-emerald-500 text-white"}`}
                  >
                    {busy === t.key ? "…" : isNew ? "Empezar" : "✓ Listo"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>,
    portal
  );
}
