"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ask } from "@/app/lib/dialog";
import { OUTBOX_SENT, discard, flush, pendingList, subscribe, type Pending } from "./outbox";

// Lo guardado sin conexión: cuántos envíos esperan, que se mandan solos al
// volver internet, y los que el servidor rechazó para revisarlos. Ver docs/SIN-CONEXION.md

const RETRY_MS = 10_000;
const snapshot = () => JSON.stringify(pendingList());
const serverSnapshot = () => "[]";

const hhmm = (t: number) => new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

export default function OutboxBar() {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const list = useMemo(() => JSON.parse(raw) as Pending[], [raw]);
  const [open, setOpen] = useState(false);
  const [sentMsg, setSentMsg] = useState("");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const n = await flush();
      if (n > 0) {
        window.dispatchEvent(new Event(OUTBOX_SENT)); // Mesas y Caja recargan lo que ven
        setSentMsg(n === 1 ? "Enviado lo que estaba guardado sin conexión" : `Enviados ${n} pedidos guardados sin conexión`);
        clearTimeout(timer);
        timer = setTimeout(() => setSentMsg(""), 5000);
      }
    };
    void run();
    const t = setInterval(run, RETRY_MS);
    window.addEventListener("online", run);
    return () => {
      clearInterval(t);
      clearTimeout(timer);
      window.removeEventListener("online", run);
    };
  }, []);

  const failed = list.filter((p) => p.error);
  const waiting = list.length - failed.length;
  if (!list.length && !sentMsg) return null;

  return (
    // En el ordenador va abajo a la izquierda, sobre el menú: así no tapa las
    // barras de cobrar de la Caja y de Mesas.
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+68px)] z-[60] flex justify-center px-3 lg:inset-x-auto lg:top-auto lg:bottom-3 lg:left-3 lg:w-[232px] lg:px-0" role="status">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-[#1d1d1f] text-white shadow-2xl">
        {!list.length ? (
          <p className="px-4 py-3 text-sm font-semibold">✓ {sentMsg}</p>
        ) : (
          <>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${failed.length ? "bg-[#ff453a]" : "bg-[#ff9f0a]"}`} aria-hidden />
              <span className="min-w-0 flex-1 text-sm">
                {waiting > 0 && (
                  <span className="block font-semibold">
                    {waiting === 1 ? "1 envío guardado sin conexión" : `${waiting} envíos guardados sin conexión`}
                  </span>
                )}
                {waiting > 0 && <span className="block text-xs text-white/70">Saldrán en cocina solos al volver internet. No cierres esta página.</span>}
                {failed.length > 0 && <span className="block font-semibold text-[#ff6961]">{failed.length === 1 ? "1 envío no se ha podido hacer" : `${failed.length} envíos no se han podido hacer`} · revisar</span>}
              </span>
              <span className="text-xs text-white/60">{open ? "Ocultar" : "Ver"}</span>
            </button>
            {open && (
              <ul className="max-h-[50vh] divide-y divide-white/10 overflow-y-auto border-t border-white/10">
                {list.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{p.label}</p>
                      <p className={`text-xs ${p.error ? "text-[#ff6961]" : "text-white/60"}`}>{p.error ? p.error : `Guardado a las ${hhmm(p.at)} · esperando conexión`}</p>
                    </div>
                    {p.error && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (await ask(`¿Quitar «${p.label}» de la lista? No se ha enviado a cocina; si hace falta, vuelve a marcarlo.`)) discard(p.id);
                        }}
                        className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold"
                      >
                        Quitar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
