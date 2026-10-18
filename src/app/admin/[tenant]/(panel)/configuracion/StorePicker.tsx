"use client";

import { useEffect, useState } from "react";

// Con varios locales: cuál se está configurando (horario, cierres y zonas).
// Se guarda en la cookie panel_store y la página se vuelve a cargar.
export default function StorePicker({ tenant }: { tenant: string }) {
  const [stores, setStores] = useState<{ id: string; name: string; active: boolean }[]>([]);
  const [current, setCurrent] = useState("");

  useEffect(() => {
    fetch(`/api/admin/${tenant}/stores`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { stores: [] }))
      .then((d: { stores: { id: string; name: string; active: boolean }[] }) => {
        setStores(d.stores);
        const saved = document.cookie.match(/(?:^|; )panel_store=([^;]+)/)?.[1];
        setCurrent(d.stores.find((s) => s.id === saved)?.id ?? d.stores[0]?.id ?? "");
      })
      .catch(() => {});
  }, [tenant]);

  if (stores.length <= 1) return null;
  return (
    <label className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--p-surface)] px-4 py-3 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <span className="font-semibold">📍 Local:</span>
      <select
        value={current}
        onChange={(e) => {
          document.cookie = `panel_store=${encodeURIComponent(e.target.value)}; path=/; max-age=31536000; samesite=lax`;
          window.location.reload();
        }}
        className="min-w-0 rounded-full border border-[var(--p-line)] bg-transparent px-3 py-1.5 font-medium"
      >
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.active ? "" : " (cerrado al público)"}
          </option>
        ))}
      </select>
      <span className="text-xs text-[var(--p-muted)]">Lo que cambies abajo es solo de este local.</span>
    </label>
  );
}
