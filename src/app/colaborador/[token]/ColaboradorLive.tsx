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
  const perk = data.discountPct > 0 ? `${data.discountPct.toLocaleString("es-ES")} %` : null;
  const share = `https://wa.me/?text=${encodeURIComponent(
    perk ? `¿Hambre? Pide en ${data.tenantName} con mi código ${data.code} y tienes un ${perk} de descuento: ${link}` : `¿Hambre? Pide en ${data.tenantName} desde aquí: ${link}`
  )}`;
  const fmtDay = (iso: string) => new Date(iso).toLocaleString("es-ES", { timeZone: data.timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const nextMonth = monthName(data.months[0].month.replace(/(\d{4})-(\d{2})/, (_, y: string, m: string) => (m === "12" ? `${Number(y) + 1}-01` : `${y}-${String(Number(m) + 1).padStart(2, "0")}`))).split(" ")[0].toLowerCase();
  const history = [...data.months].reverse();
  const maxEarned = Math.max(1, ...history.map((m) => m.earnedCents));
  const [copied, setCopied] = useState(false);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* sin portapapeles: el enlace se ve debajo del QR */
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f5f7] px-4 pt-[max(20px,env(safe-area-inset-top))] pb-12 text-[#1d1d1f]">
      {toast && (
        <div role="status" className="fixed inset-x-0 top-[max(12px,env(safe-area-inset-top))] z-50 flex justify-center px-4">
          <p className="rounded-2xl bg-[#1d1d1f] px-5 py-3 text-center text-[15px] font-semibold text-white shadow-2xl">{toast}</p>
        </div>
      )}
      <div className="mx-auto max-w-md space-y-4">
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-[#6e6e73]">{data.tenantName}</p>
            <h1 className="text-3xl font-semibold tracking-tight">Hola, {data.name.split(" ")[0]}</h1>
          </div>
          <span className="mb-1 flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[#6e6e73] shadow-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
            {ago < 10 ? "En directo" : `hace ${ago} s`}
          </span>
        </header>
        {!data.active && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Tu código está en pausa. Habla con {data.tenantName}.</p>}

        {/* Lo ganado este mes */}
        <section className="overflow-hidden rounded-3xl bg-[#1d1d1f] p-5 text-white shadow-lg">
          <p className="text-sm text-white/60">{monthName(cur.month)} · llevas ganado</p>
          <p className="mt-1 text-[52px] leading-none font-semibold tracking-tight tabular-nums">{euros(cur.earnedCents)}</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Mini label={cur.count === 1 ? "pedido" : "pedidos"} value={String(cur.count)} />
            <Mini label="en ventas" value={euros(cur.totalCents)} />
            <Mini label="tu parte" value={`${data.commissionPct.toLocaleString("es-ES")} %`} />
          </div>
          {vsPrev != null && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-white/60">
                <span>Frente al mes pasado ({euros(prev.earnedCents)})</span>
                <span className="font-semibold text-white">{vsPrev} %</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={Math.min(vsPrev, 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-700" style={{ width: `${Math.min(vsPrev, 100)}%` }} />
              </div>
              {vsPrev >= 100 && <p className="mt-1.5 text-xs font-semibold text-emerald-300">¡Ya has superado lo del mes pasado!</p>}
            </div>
          )}
          <p className="mt-4 text-xs text-white/50">Se te paga en efectivo a principios de {nextMonth}.</p>
        </section>

        {/* Tu código */}
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-[#6e6e73]">Tu código</p>
              <p className="text-3xl font-bold tracking-widest break-all">{data.code}</p>
            </div>
            {perk && <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">Tus clientes −{perk}</span>}
          </div>
          <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-4">
            <div className="w-[132px] rounded-2xl bg-[#f5f5f7] p-2.5 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <ul className="space-y-2.5 text-sm">
              <li>
                <span className="font-semibold">Online</span>
                <span className="block text-[13px] text-[#6e6e73]">Con tu enlace o este QR. Cuenta solo.</span>
              </li>
              <li>
                <span className="font-semibold">En el local</span>
                <span className="block text-[13px] text-[#6e6e73]">Que digan «{data.code}» al pedir o al pagar{perk ? ` y se les descuenta el ${perk}` : ""}.</span>
              </li>
            </ul>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href={share} target="_blank" rel="noopener noreferrer" className="col-span-2 flex items-center justify-center gap-2 rounded-full bg-[#25d366] py-3 text-sm font-semibold text-white">
              Compartir por WhatsApp
            </a>
            <button onClick={copyLink} className="rounded-full bg-black/[0.06] py-3 text-sm font-semibold">
              {copied ? "¡Copiado!" : "Copiar enlace"}
            </button>
            <a href={`/colaborador/${token}/tarjetas`} className="rounded-full bg-black/[0.06] py-3 text-center text-sm font-semibold">
              Tarjetas VIP
            </a>
          </div>
        </section>

        {/* Avisos y app */}
        {((push && push !== "unsupported") || (!standalone && (install || ios))) && (
          <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
            {push && push !== "unsupported" && (
              <div>
                <p className="font-semibold">Avisos de cada venta</p>
                {push === "on" ? (
                  <p className="mt-0.5 text-sm text-[#6e6e73]">
                    Activados: te avisamos al momento, aunque tengas la app cerrada.{" "}
                    <button onClick={togglePush} disabled={pushBusy} className="font-semibold underline disabled:opacity-50">
                      Desactivar
                    </button>
                  </p>
                ) : push === "ios-install" ? (
                  <p className="mt-0.5 text-sm text-[#6e6e73]">En iPhone, primero añade la app a tu pantalla de inicio y ábrela desde ahí.</p>
                ) : push === "denied" ? (
                  <p className="mt-0.5 text-sm text-[#6e6e73]">Los tienes bloqueados para esta página. Actívalos en los ajustes del navegador.</p>
                ) : (
                  <button onClick={togglePush} disabled={pushBusy} className="mt-2 w-full rounded-full bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
                    {pushBusy ? "Activando…" : "Avisarme de cada venta"}
                  </button>
                )}
              </div>
            )}
            {!standalone && (install || ios) && (
              <div className={push && push !== "unsupported" ? "border-t border-black/5 pt-3" : ""}>
                <p className="font-semibold">Tenlo como una app</p>
                {install ? (
                  <button
                    onClick={async () => {
                      await install.prompt();
                      await install.userChoice;
                      setInstall(null);
                    }}
                    className="mt-2 w-full rounded-full bg-[#1d1d1f] py-3 text-sm font-semibold text-white"
                  >
                    Instalar «Mis ventas»
                  </button>
                ) : (
                  <p className="mt-0.5 text-sm text-[#6e6e73]">En Safari toca Compartir y luego «Añadir a pantalla de inicio». Se abrirá directamente aquí.</p>
                )}
              </div>
            )}
          </section>
        )}

        {/* Pedidos del mes */}
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Pedidos de este mes</h2>
          {data.orders.length === 0 ? (
            <p className="mt-2 text-sm text-[#6e6e73]">Todavía ninguno. Comparte tu enlace o manda gente al local con tu código: aparecerán aquí al momento.</p>
          ) : (
            <ul className="mt-2 divide-y divide-black/5 text-sm">
              {data.orders.map((o) => (
                <li key={o.id} className={`flex items-center justify-between gap-3 rounded-xl py-2.5 tabular-nums transition-colors duration-1000 ${fresh.has(o.id) ? "bg-emerald-50 px-2" : ""}`}>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      {fmtDay(o.at)}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${o.inStore ? "bg-violet-50 text-violet-700" : "bg-sky-50 text-sky-700"}`}>{o.inStore ? "En el local" : "Online"}</span>
                    </span>
                    <span className="block text-xs text-[#6e6e73]">
                      Nº {o.number} · {euros(o.totalCents)}
                    </span>
                  </span>
                  <span className="font-semibold text-emerald-700">+{euros(o.earnedCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Últimos meses */}
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Tus últimos meses</h2>
          <div className="mt-4 flex h-28 items-end gap-2" aria-hidden>
            {history.map((m, i) => (
              <div key={m.month} className="flex h-full flex-1 flex-col items-center gap-1">
                <div className="relative w-full flex-1">
                  <div className={`absolute inset-x-0 bottom-0 rounded-t-md ${i === history.length - 1 ? "bg-emerald-500" : "bg-black/[0.12]"}`} style={{ height: `${Math.max(4, (m.earnedCents / maxEarned) * 100)}%` }} />
                </div>
                <span className="text-[10px] text-[#6e6e73] capitalize">{monthName(m.month).slice(0, 3)}</span>
              </div>
            ))}
          </div>
          <ul className="mt-3 divide-y divide-black/5 text-sm">
            {data.months.slice(1).map((m) => (
              <li key={m.month} className="flex items-center justify-between gap-3 py-2.5 tabular-nums">
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
        <p className="text-center text-xs text-[#6e6e73]">Solo tú ves esta página. No compartas este enlace: el que sirve para pedir es el de tu código.</p>
      </div>
    </main>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-2 py-2.5">
      <p className="truncate text-base font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-white/60">{label}</p>
    </div>
  );
}
