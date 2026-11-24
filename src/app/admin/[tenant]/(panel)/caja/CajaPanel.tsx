"use client";

import { useCallback, useEffect, useState } from "react";
import CashSessionSheet, { type CashState } from "./CashSessionSheet";
import CajaDia from "./CajaDia";
import NewOrder, { type NewOrderProps } from "../NewOrder";

// Caja (menú): el dinero. Arriba, el estado de la caja con botones grandes y
// claros: «Abrir caja» o, abierta, «Cerrar caja», «Entra dinero» y «Sale
// dinero». Debajo, lo vendido del día (CajaDia: desglose, pendiente y
// tickets). «＋ Nuevo pedido» abre encima la pantalla de tomar pedidos.
// Ver docs/CAJA.md
const euros = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

type Sheet = null | "main" | "close" | "in" | "out";

export default function CajaPanel({ tenant, canSeeTakings, newOrder }: { tenant: string; canSeeTakings: boolean; newOrder: NewOrderProps }) {
  const [cash, setCash] = useState<CashState | null>(null);
  const [error, setError] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [composer, setComposer] = useState(false);
  const [dayKey, setDayKey] = useState(0); // recarga lo vendido tras cobrar o cerrar

  const load = useCallback(() => {
    fetch(`/api/admin/${tenant}/caja/sesion`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: CashState) => {
        setCash(d);
        setError(false);
      })
      .catch(() => setError(true));
  }, [tenant]);
  useEffect(() => {
    load();
  }, [load]);

  const open = cash?.open;
  const fig = cash?.figures;
  const BIG = "p-press flex min-h-14 items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-semibold";

  return (
    <div className="text-[var(--p-ink)]">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Caja</h1>
          <p className="mt-1 text-sm text-[var(--p-muted)]">Abrir y cerrar la caja, el dinero del cajón y lo vendido hoy.</p>
        </div>
        <button type="button" onClick={() => setComposer(true)} className="p-press flex min-h-11 items-center rounded-full bg-[var(--p-brand)] px-5 text-sm font-semibold text-[var(--p-on-brand)] shadow-sm">
          ＋ Nuevo pedido
        </button>
      </header>

      {/* Estado de la caja y lo que se puede hacer: siempre a la vista */}
      <section className={`rounded-3xl p-5 ring-1 lg:p-6 ${cash && !open ? "bg-amber-50 ring-amber-200" : "bg-[var(--p-surface)] ring-[var(--p-line)]"}`} aria-label="Estado de la caja">
        {!cash ? (
          <p className="py-6 text-center text-sm text-[var(--p-muted)]">{error ? "No se ha podido cargar la caja. Revisa la conexión." : "Cargando…"}</p>
        ) : !open ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-lg font-semibold text-amber-900">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-amber-500" /> La caja está cerrada
              </p>
              <p className="mt-1 text-sm text-amber-900/80">Ábrela con el efectivo que dejas en el cajón para poder vender en el local.</p>
            </div>
            <button type="button" onClick={() => setSheet("main")} className={`${BIG} bg-[var(--p-brand)] text-[var(--p-on-brand)] sm:min-w-56`}>
              Abrir caja
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="flex items-center gap-2 text-lg font-semibold">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Caja abierta
              </p>
              <p className="text-sm text-[var(--p-muted)]">
                Desde las {hhmm(open.openedAt)}
                {open.openedByName && ` · ${open.openedByName}`} · fondo {euros(open.openingFloatCents)}
              </p>
            </div>
            {fig && (
              <p className="mt-3 text-sm">
                Debería haber en el cajón: <b className="text-lg tabular-nums">{euros(fig.expectedCashCents)}</b>
              </p>
            )}
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => setSheet("in")} className={`${BIG} bg-black/[0.05]`}>
                + Entra dinero
              </button>
              <button type="button" onClick={() => setSheet("out")} className={`${BIG} bg-black/[0.05]`}>
                − Sale dinero
              </button>
              <button type="button" onClick={() => setSheet("close")} className={`${BIG} bg-[var(--p-accent)] text-white`}>
                Cerrar caja
              </button>
            </div>
            <button type="button" onClick={() => setSheet("main")} className="mt-3 text-sm font-semibold text-[var(--p-brand)] underline underline-offset-2">
              Ver movimientos y cierre parcial
            </button>
          </>
        )}
      </section>

      {canSeeTakings ? (
        <div className="mt-5">
          <CajaDia key={dayKey} tenant={tenant} inline onChanged={load} />
        </div>
      ) : (
        <p className="mt-5 rounded-2xl bg-[var(--p-surface)] p-4 text-sm text-[var(--p-muted)] ring-1 ring-[var(--p-line)]">Lo vendido del día solo lo ve quien tiene el permiso «Ve lo recaudado».</p>
      )}

      {sheet && (
        <CashSessionSheet
          tenant={tenant}
          state={cash}
          start={sheet}
          onState={(s) => {
            setCash(s);
            setDayKey((k) => k + 1);
          }}
          onClose={() => {
            setSheet(null);
            load();
          }}
        />
      )}
      {composer && (
        <NewOrder
          tenant={tenant}
          {...newOrder}
          onClose={() => {
            setComposer(false);
            load();
            setDayKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
