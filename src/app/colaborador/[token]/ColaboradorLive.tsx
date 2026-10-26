"use client";

import { useEffect, useRef, useState } from "react";
import type { CollaboratorDashboard } from "@/app/lib/collaboratorDashboard";
import { disablePush, enablePush, pushState, type PushState } from "@/app/lib/pushClient";

// La app del colaborador al momento: se refresca sola cada pocos segundos
// mientras está abierta y avisa (y vibra) cuando entra un pedido con su código.

const REFRESH_MS = 15_000;
const euros = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const monthName = (m: string) => {
  const t = new Date(`${m}-15T12:00:00Z`).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function ColaboradorLive({ token, initial, link, qrSvg }: { token: string; initial: CollaboratorDashboard; link: string; qrSvg: string }) {
  const [data, setData] = useState(initial);
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);
  const known = useRef(new Set(initial.orders.map((o) => o.id)));
  // Avisos con la app cerrada (cada venta con su código).
  const [push, setPush] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => {
    pushState().then(setPush).catch(() => setPush("unsupported"));
  }, []);
  async function togglePush() {
    setPushBusy(true);
    try {
      setPush(push === "on" ? await disablePush(`/api/colaborador/${token}/push`) : await enablePush(`/api/colaborador/${token}/push`));
    } catch {
      setToast("No se pudieron activar los avisos. Inténtalo otra vez.");
      setTimeout(() => setToast(null), 5000);
    } finally {
      setPushBusy(false);
    }
  }

  // Refresco al momento: cada 15 s con la pantalla visible y al volver a ella.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/colaborador/${token}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as CollaboratorDashboard;
        if (!alive) return;
        const nuevos = next.orders.filter((o) => !known.current.has(o.id));
        if (nuevos.length) {
          const earned = nuevos.reduce((a, o) => a + o.earnedCents, 0);
          setToast(nuevos.length === 1 ? `¡Nuevo pedido con tu código! +${euros(earned)}` : `¡${nuevos.length} pedidos nuevos! +${euros(earned)}`);
          setFresh(new Set(nuevos.map((o) => o.id)));
          navigator.vibrate?.([120, 60, 120]);
          setTimeout(() => setToast(null), 6000);
          for (const o of nuevos) known.current.add(o.id);
        }
        setData(next);
        setUpdatedAt(Date.now());
      } catch {
        // sin conexión: se reintenta en la siguiente vuelta
      }
    };
    const t = setInterval(load, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 5000);
    const onVisible = () => !document.hidden && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);

  // Instalar como app (Android/Chrome: botón; iPhone: instrucciones).
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const t = setTimeout(() => {
      setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
      setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    }, 0);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      clearTimeout(t);
    };
  }, []);

  const [cur, prev] = data.months;
  const vsPrev = prev && prev.earnedCents > 0 ? Math.round((cur.earnedCents / prev.earnedCents) * 100) : null;
  const ago = Math.max(0, Math.round((now - updatedAt) / 1000));
  const share = `https://wa.me/?text=${encodeURIComponent(`¿Hambre? Pide en ${data.tenantName} desde aquí: ${link}`)}`;
  const fmtDay = (iso: string) => new Date(iso).toLocaleString("es-ES", { timeZone: data.timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <main className="min-h-screen bg-[#f5f5f7] px-4 pt-[max(24px,env(safe-area-inset-top))] pb-10 text-[#1d1d1f]">
      {toast && (
        <div role="status" className="fixed inset-x-0 top-[max(12px,env(safe-area-inset-top))] z-50 flex justify-center px-4">
          <p className="rounded-2xl bg-[#1d1d1f] px-5 py-3 text-center text-[15px] font-semibold text-white shadow-2xl">{toast}</p>
        </div>
      )}
      <div className="mx-auto max-w-md space-y-4">
        <header>
          <p className="text-sm text-[#6e6e73]">{data.tenantName} · colaboradores</p>
          <h1 className="text-3xl font-semibold tracking-tight">Hola, {data.name.split(" ")[0]}</h1>
          {!data.active && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Tu código está en pausa. Habla con {data.tenantName}.</p>}
        </header>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-[#6e6e73]">{monthName(cur.month)} · llevas ganado</p>
            <span className="flex items-center gap-1.5 text-[11px] text-[#6e6e73]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
              {ago < 10 ? "al momento" : `hace ${ago} s`}
            </span>
          </div>
          <p className="text-5xl font-semibold tabular-nums tracking-tight">{euros(cur.earnedCents)}</p>
          <p className="mt-2 text-sm tabular-nums">
            Has traído <span className="font-semibold">{cur.count} {cur.count === 1 ? "pedido" : "pedidos"}</span> por <span className="font-semibold">{euros(cur.totalCents)}</span>. Tu parte es el <span className="font-semibold">{data.commissionPct.toLocaleString("es-ES")} %</span>.
          </p>
          {vsPrev != null && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-[#6e6e73]">
                <span>Frente al mes pasado ({euros(prev.earnedCents)})</span>
                <span className="font-semibold text-[#1d1d1f]">{vsPrev} %</span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-black/[0.06]" role="progressbar" aria-valuenow={Math.min(vsPrev, 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-700" style={{ width: `${Math.min(vsPrev, 100)}%` }} />
              </div>
              {vsPrev >= 100 && <p className="mt-1 text-xs font-semibold text-emerald-700">¡Ya has superado lo del mes pasado!</p>}
            </div>
          )}
          <p className="mt-3 text-xs text-[#6e6e73]">Se paga en efectivo a principios del mes siguiente.</p>
        </section>

        {!standalone && (install || ios) && (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="font-semibold">Tenlo en tu móvil como una app</p>
            {install ? (
              <button
                onClick={async () => {
                  await install.prompt();
                  await install.userChoice;
                  setInstall(null);
                }}
                className="mt-3 w-full rounded-full bg-[#1d1d1f] py-3 text-sm font-semibold text-white"
              >
                Instalar «Mis ventas»
              </button>
            ) : (
              <p className="mt-1 text-sm text-[#6e6e73]">En Safari toca Compartir y luego «Añadir a pantalla de inicio». Se abrirá directamente aquí.</p>
            )}
          </section>
        )}

        {push && push !== "unsupported" && (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="font-semibold">Avisos de cada venta</p>
            {push === "on" ? (
              <>
                <p className="mt-1 text-sm text-[#6e6e73]">Te avisamos en el móvil con cada pedido que traigas, aunque tengas la app cerrada.</p>
                <button onClick={togglePush} disabled={pushBusy} className="mt-2 text-sm font-semibold text-[#6e6e73] underline disabled:opacity-50">
                  Desactivar avisos
                </button>
              </>
            ) : push === "ios-install" ? (
              <p className="mt-1 text-sm text-[#6e6e73]">En iPhone, primero añade la app a tu pantalla de inicio (arriba te explicamos cómo) y ábrela desde ahí.</p>
            ) : push === "denied" ? (
              <p className="mt-1 text-sm text-[#6e6e73]">Tienes los avisos bloqueados para esta página. Actívalos en los ajustes del navegador.</p>
            ) : (
              <button onClick={togglePush} disabled={pushBusy} className="mt-3 w-full rounded-full bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
                {pushBusy ? "Activando…" : "Avisarme de cada venta"}
              </button>
            )}
          </section>
        )}

        <section className="rounded-2xl bg-white p-5 text-center shadow-sm">
          <p className="text-sm text-[#6e6e73]">Tu código</p>
          <p className="text-3xl font-bold tracking-widest">{data.code}</p>
          <div className="mx-auto mt-3 w-[220px]" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p className="mt-2 break-all text-xs text-[#6e6e73]">{link}</p>
          <p className="mt-2 text-sm">Quien pide desde este enlace o este QR, o escribe tu código al pagar, cuenta para ti.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <a href={share} target="_blank" rel="noopener noreferrer" className="inline-block rounded-full bg-[#25d366] px-5 py-3 text-sm font-semibold text-white">
              Compartir por WhatsApp
            </a>
            <a href={`/colaborador/${token}/tarjetas`} className="inline-block rounded-full bg-black/[0.06] px-5 py-3 text-sm font-semibold">
              Imprimir tarjetas
            </a>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Pedidos de este mes</h2>
          {data.orders.length === 0 ? (
            <p className="mt-2 text-sm text-[#6e6e73]">Todavía ninguno. Comparte tu enlace y aparecerán aquí al momento.</p>
          ) : (
            <ul className="mt-2 divide-y divide-black/5 text-sm">
              {data.orders.map((o) => (
                <li key={o.id} className={`flex items-center justify-between gap-3 rounded-lg py-2 tabular-nums transition-colors duration-1000 ${fresh.has(o.id) ? "bg-emerald-50 px-2" : ""}`}>
                  <span>
                    {fmtDay(o.at)}
                    <span className="block text-xs text-[#6e6e73]">
                      Pedido nº {o.number} · {euros(o.totalCents)}
                    </span>
                  </span>
                  <span className="font-semibold text-emerald-700">+{euros(o.earnedCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Meses anteriores</h2>
          <ul className="mt-2 divide-y divide-black/5 text-sm">
            {data.months.slice(1).map((m) => (
              <li key={m.month} className="flex items-center justify-between gap-3 py-2 tabular-nums">
                <span>
                  {monthName(m.month)}
                  <span className="block text-xs text-[#6e6e73]">
                    {m.count} {m.count === 1 ? "pedido" : "pedidos"} · {euros(m.totalCents)}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold">{euros(m.earnedCents)}</span>
                  <span className={`block text-xs ${m.paidAt ? "text-emerald-700" : m.earnedCents ? "text-amber-700" : "text-[#6e6e73]"}`}>
                    {m.paidAt ? `Pagado el ${new Date(m.paidAt).toLocaleDateString("es-ES", { timeZone: data.timeZone })}` : m.earnedCents ? "Pendiente de pago" : "—"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
