"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { audioRunning, playOrderChime, repeatUntilAccepted, SOUND_EVENT, soundEnabled, unlockAudio } from "./sound";

// Aviso de pedidos nuevos en TODO el panel (no solo en Pedidos):
// - suena un "cha-ching" cuando entra un pedido nuevo y, si está activado
//   «Repetir hasta aceptar» (por defecto), cada ~8 s mientras haya pedidos sin aceptar;
// - muestra un aviso flotante con enlace a Pedidos;
// - el sonido se desbloquea solo con el primer toque/clic/tecla en el panel.

type Pending = { id: string; orderNumber: number | null; customerName: string; totalCents: number; channel: string };

const POLL_MS = 8_000;
const euros = (c: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(c / 100);

export default function OrderAlerts({ tenant }: { tenant: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const onOrdersPage = pathname.startsWith(`/admin/${tenant}/pedidos`);
  const [pending, setPending] = useState<Pending[]>([]);
  const [toast, setToast] = useState<Pending | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const known = useRef<Set<string> | null>(null);

  // Preferencia guardada + desbloqueo del audio con la primera interacción.
  useEffect(() => {
    const sync = () => {
      setEnabled(soundEnabled());
      setUnlocked(audioRunning());
    };
    const unlock = () => {
      unlockAudio().then((ok) => setUnlocked(ok));
    };
    sync();
    window.addEventListener(SOUND_EVENT, sync);
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener(SOUND_EVENT, sync);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${tenant}/pending`, { cache: "no-store" });
      if (res.status === 401) {
        router.replace(`/admin/${tenant}/login`);
        return;
      }
      if (!res.ok) return;
      const { pending: list } = (await res.json()) as { pending: Pending[] };
      const ids = new Set(list.map((p) => p.id));
      // Primera carga: no suena por lo que ya había; solo por lo que entre después.
      const fresh = known.current ? list.filter((p) => !known.current!.has(p.id)) : [];
      if (fresh.length) {
        setToast(fresh[fresh.length - 1]);
        // El tablero de Pedidos se refresca al instante sin esperar a su ciclo.
        window.dispatchEvent(new Event("panel-new-order"));
      }
      // Suena por un pedido nuevo o, si se repite, mientras quede alguno sin aceptar.
      // Al aceptarlos todos (lista vacía) deja de sonar.
      if (soundEnabled() && (fresh.length > 0 || (repeatUntilAccepted() && list.length > 0))) playOrderChime();
      known.current = ids;
      setPending(list);
    } catch {
      /* sin conexión: se reintenta en el siguiente ciclo */
    }
  }, [tenant, router]);

  useEffect(() => {
    const first = setTimeout(poll, 0); // primera consulta nada más montar
    const id = setInterval(poll, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [poll]);

  // El título de la pestaña muestra los pendientes aunque esté en segundo plano.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = pending.length ? `(${pending.length}) ${base}` : base;
  }, [pending.length, pathname]);

  // Si el pedido del aviso ya se aceptó, el aviso desaparece.
  const visibleToast = toast && pending.some((p) => p.id === toast.id) && !onOrdersPage ? toast : null;
  const needsTap = enabled && !unlocked && pending.length > 0;

  if (!visibleToast && !needsTap) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5">
      {needsTap && (
        <button
          onClick={() => unlockAudio().then((ok) => { setUnlocked(ok); if (ok) playOrderChime(); })}
          className="p-press pointer-events-auto rounded-full bg-[var(--p-accent)] px-4 py-2 text-sm font-semibold text-white shadow-lg"
        >
          🔔 Toca para activar el sonido
        </button>
      )}
      {visibleToast && (
        <div className="p-rise pointer-events-auto flex w-full items-center gap-3 rounded-2xl bg-[var(--p-brand)] p-4 text-white shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)] sm:w-80">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              Nuevo pedido{visibleToast.orderNumber != null ? ` #${visibleToast.orderNumber}` : ""}
              {pending.length > 1 && <span className="font-normal text-white/80"> · {pending.length} sin aceptar</span>}
            </p>
            <p className="truncate text-sm text-white/80">
              {visibleToast.customerName} · {visibleToast.channel === "DELIVERY" ? "A domicilio" : "Para recoger"} · {euros(visibleToast.totalCents)}
            </p>
          </div>
          <Link href={`/admin/${tenant}/pedidos`} className="p-press shrink-0 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-[var(--p-brand)]">
            Ver
          </Link>
        </div>
      )}
    </div>
  );
}
