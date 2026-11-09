"use client";

import Link from "next/link";
import { useState } from "react";
import { readReservationSettings, type ReservationSettings } from "@/app/lib/reservations";
import { Card, Toggle, ghostBtn, input, toast, useSaveBar, useTenantSettings } from "../ui";

// Configuración → Reservas: activar las reservas online y sus reglas.
// Se guarda en Tenant.settings.reservations. Ver docs/RESERVAS.md
export default function Reservas({ tenant }: { tenant: string }) {
  const { settings, save } = useTenantSettings(tenant);
  const [edits, setEdits] = useState<ReservationSettings | null>(null);
  const saved = readReservationSettings(settings);
  const r = edits ?? saved;
  const set = (patch: Partial<ReservationSettings>) => setEdits({ ...r, ...patch });
  useSaveBar("reservas", {
    dirty: !!edits && JSON.stringify(edits) !== JSON.stringify(saved),
    discard: () => setEdits(null),
    save: async () => {
      try {
        await save({ reservations: r });
        setEdits(null);
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo guardar", false);
        return false;
      }
    },
  });
  const link = typeof window !== "undefined" ? `${window.location.origin}/pedir/${tenant}/reservar` : `/pedir/${tenant}/reservar`;
  const num = (label: string, hint: string, value: number, unit: string, min: number, max: number, key: keyof ReservationSettings) => (
    <label className="block text-sm font-medium">
      {label}
      <span className="mt-1 flex items-center gap-2">
        <input type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<ReservationSettings>)} className={`${input} mt-0 w-28`} />
        <span className="text-sm text-[var(--p-muted)]">{unit}</span>
      </span>
      <span className="mt-1 block text-xs font-normal text-[var(--p-muted)]">{hint}</span>
    </label>
  );

  if (!settings) return <p className="text-sm text-[var(--p-muted)]">Cargando…</p>;
  return (
    <div className="space-y-5">
      <Card title="Reservas online" description="Tus clientes reservan mesa desde tu tienda: eligen personas, día y hora según tu horario y el sitio libre.">
        <div className="divide-y divide-[var(--p-line)]">
          <Toggle checked={r.enabled} onChange={(v) => set({ enabled: v })} label="Aceptar reservas desde la tienda" hint="Sale el botón «Reservar mesa» en tu carta. Las reservas por teléfono las apuntas en Reservas aunque esto esté apagado." />
          <Toggle checked={r.autoConfirm} onChange={(v) => set({ autoConfirm: v })} label="Confirmarlas al momento" hint="Si lo apagas, cada reserva queda pendiente hasta que la aceptes en Reservas." />
          <Toggle checked={r.notifyEmail} onChange={(v) => set({ notifyEmail: v })} label="Avisarme por email de cada reserva" hint="Al email de Información del negocio." />
        </div>
        {r.enabled && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-black/[0.03] px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm font-medium select-all">{link}</span>
            <button type="button" className={ghostBtn} onClick={() => navigator.clipboard?.writeText(link).then(() => toast("Enlace copiado")).catch(() => toast("Selecciona el enlace y cópialo", false))}>Copiar enlace</button>
          </div>
        )}
      </Card>

      <Card title="Reglas" description="Las horas se ofrecen dentro de tu horario de apertura (Horario y zonas), sin reservas en la última media hora.">
        <div className="grid gap-5 sm:grid-cols-2">
          {num("Duración de cada mesa", "Lo que se queda ocupada una reserva.", r.durationMinutes, "minutos", 30, 300, "durationMinutes")}
          {num("Aforo para reservas", "Comensales a la vez. 0 = la suma de las plazas de tus mesas.", r.capacity, "comensales", 0, 2000, "capacity")}
          {num("Máximo de personas por reserva", "Para grupos mayores, que llamen.", r.maxGuestsOnline, "personas", 1, 50, "maxGuestsOnline")}
          {num("Antelación mínima", "Cuánto antes hay que reservar.", r.minNoticeMinutes, "minutos", 0, 2880, "minNoticeMinutes")}
          {num("Reservar hasta", "Con cuántos días de antelación como mucho.", r.maxDaysAhead, "días", 1, 180, "maxDaysAhead")}
          <label className="block text-sm font-medium">
            Horas cada
            <select value={r.stepMinutes} onChange={(e) => set({ stepMinutes: Number(e.target.value) })} className={`${input} w-40`}>
              <option value={15}>15 minutos</option>
              <option value={30}>30 minutos</option>
            </select>
            <span className="mt-1 block text-xs font-normal text-[var(--p-muted)]">13:00, 13:15, 13:30… o 13:00, 13:30…</span>
          </label>
        </div>
      </Card>

      <Card title="Mensaje para el cliente" description="Sale arriba en la página de reservar. Por ejemplo: «Mantenemos la mesa 15 minutos».">
        <textarea value={r.customerNote} onChange={(e) => set({ customerNote: e.target.value.slice(0, 300) })} rows={2} className={input} placeholder="Mantenemos la mesa 15 minutos. Para grupos de más de 8, llámanos." />
      </Card>

      <p className="text-sm text-[var(--p-muted)]">
        Las reservas del día están en <Link href={`/admin/${tenant}/reservas`} className="font-semibold text-[var(--p-ink)] underline">Reservas</Link>.
      </p>
    </div>
  );
}
