"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, Msg, ghostBtn, input, primaryBtn } from "../ui";

type Store = { id: string; name: string; address: string | null; phone: string | null; active: boolean; zones: number; orders30d: number };

// Sucursales: cada local tiene su horario, cierres y zonas; los canales,
// precios y tiempos son comunes. Con más de uno, el cliente elige local.
export default function Sucursales({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/stores`;
  const [stores, setStores] = useState<Store[] | null>(null);
  const [edit, setEdit] = useState<Partial<Store> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch(api, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => setStores(d.stores))
      .catch(() => setMsg({ ok: false, text: "No se pudieron cargar los locales" }));
  }, [api]);

  async function send(method: "POST" | "PATCH", body: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(api, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Algo ha fallado");
      setStores(json.stores);
      setEdit(null);
      setMsg({ ok: true, text: "Guardado." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Algo ha fallado" });
    } finally {
      setBusy(false);
    }
  }

  const goHours = (id: string) => {
    document.cookie = `panel_store=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <div className="space-y-5">
      <Card title="Tus locales" description="Con más de un local abierto al público, tus clientes eligen el suyo en la tienda y cada pedido llega marcado con su local.">
        {!stores ? (
          <p className="text-sm text-[var(--p-muted)]">Cargando…</p>
        ) : (
          <ul className="divide-y divide-[var(--p-line)]">
            {stores.map((s) => (
              <li key={s.id} className="py-3">
                {edit?.id === s.id ? (
                  <StoreForm value={edit} onChange={setEdit} />
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold">
                        📍 {s.name}
                        {!s.active && <span className="ml-2 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-[var(--p-muted)]">Cerrado al público</span>}
                      </p>
                      <p className="text-xs text-[var(--p-muted)]">
                        {[s.address, s.phone].filter(Boolean).join(" · ") || "Sin dirección"} · {s.zones} {s.zones === 1 ? "zona" : "zonas"} · {s.orders30d} pedidos en 30 días
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/admin/${tenant}/configuracion/horario`} onClick={() => goHours(s.id)} className={`${ghostBtn} !px-3 !py-1.5 text-xs`}>
                        Horario y zonas
                      </Link>
                      <button type="button" onClick={() => setEdit(s)} className={`${ghostBtn} !px-3 !py-1.5 text-xs`}>
                        Editar
                      </button>
                      <button type="button" disabled={busy} onClick={() => send("PATCH", { id: s.id, active: !s.active })} className={`${ghostBtn} !px-3 !py-1.5 text-xs`}>
                        {s.active ? "Cerrar al público" : "Abrir al público"}
                      </button>
                    </div>
                  </div>
                )}
                {edit?.id === s.id && (
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={busy} onClick={() => send("PATCH", { id: s.id, name: edit.name, address: edit.address ?? "", phone: edit.phone ?? "" })} className={primaryBtn}>
                      Guardar
                    </button>
                    <button type="button" onClick={() => setEdit(null)} className={ghostBtn}>
                      Cancelar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <Msg msg={msg} />
      </Card>

      <Card title="Añadir local" description="Se crea con los mismos canales, precios, tiempos y horario que el primero. Después ajusta su horario y sus zonas de reparto.">
        {edit && !edit.id ? (
          <>
            <StoreForm value={edit} onChange={setEdit} />
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={busy || !edit.name?.trim()} onClick={() => send("POST", edit)} className={primaryBtn}>
                {busy ? "Creando…" : "Crear local"}
              </button>
              <button type="button" onClick={() => setEdit(null)} className={ghostBtn}>
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => setEdit({ name: "", address: "", phone: "" })} className={ghostBtn}>
            + Añadir local
          </button>
        )}
      </Card>
    </div>
  );
}

function StoreForm({ value, onChange }: { value: Partial<Store>; onChange: (v: Partial<Store>) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-xs text-[var(--p-muted)]">
        Nombre
        <input value={value.name ?? ""} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Estafetén Centro" className={input} />
      </label>
      <label className="text-xs text-[var(--p-muted)]">
        Dirección
        <input value={value.address ?? ""} onChange={(e) => onChange({ ...value, address: e.target.value })} placeholder="Calle Arabial, 92" className={input} />
      </label>
      <label className="text-xs text-[var(--p-muted)]">
        Teléfono
        <input value={value.phone ?? ""} onChange={(e) => onChange({ ...value, phone: e.target.value })} className={input} />
      </label>
    </div>
  );
}
