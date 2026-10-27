"use client";

import { useMemo, useState } from "react";
import { Sheet } from "../mesas/shared";
import { AllergenRow } from "@/app/pedir/[tenant]/FoodIcons";
import DietBadges from "@/app/pedir/[tenant]/DietBadges";
import type { DietTag } from "@/app/lib/diet";

// Carta → «Importar de Last.app»: trae fotos, alérgenos y sellos de la tienda
// que el restaurante tenía en Last. Primero propone las parejas (se pueden
// cambiar a mano) y después importa solo lo marcado. Ver docs/IMPORTAR-LAST.md

type Ours = { id: string; name: string; category: string; imageUrl: string | null };
type Theirs = { name: string; thumb: string | null; allergens: string[]; diet: DietTag[] };
type Result = { photos: number; allergens: number; diet: number; failed: string[] };

export default function ImportLast({ tenant, onClose, onDone }: { tenant: string; onClose: () => void; onDone: () => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<{ products: Ours[]; last: Theirs[] } | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({}); // productId → nombre en Last ("" = nada)
  const [what, setWhat] = useState({ photos: true, allergens: true, diet: true });
  const [result, setResult] = useState<Result | null>(null);

  const lastByName = useMemo(() => new Map((data?.last ?? []).map((l) => [l.name, l])), [data]);
  const chosen = Object.entries(pick).filter(([, name]) => name);

  async function call(body: object) {
    const res = await fetch(`/api/admin/${tenant}/importar-last`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, ...body }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "No se pudo completar");
    return json;
  }

  async function search() {
    setLoading(true);
    setError("");
    try {
      const json = await call({});
      setData({ products: json.products, last: json.last });
      setPick(json.matches ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar");
    } finally {
      setLoading(false);
    }
  }

  async function run() {
    setLoading(true);
    setError("");
    try {
      setResult(await call({ apply: chosen.map(([productId, lastName]) => ({ productId, lastName })), ...what }));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar");
    } finally {
      setLoading(false);
    }
  }

  const footer = result ? (
    <button type="button" onClick={onClose} className="p-press w-full rounded-full bg-[var(--p-brand)] py-3 text-sm font-semibold text-white">
      Hecho
    </button>
  ) : data ? (
    <button type="button" onClick={run} disabled={loading || !chosen.length || !(what.photos || what.allergens || what.diet)} className="p-press w-full rounded-full bg-[var(--p-brand)] py-3 text-sm font-semibold text-white disabled:opacity-50">
      {loading ? "Importando… (puede tardar un minuto)" : `Importar ${chosen.length} ${chosen.length === 1 ? "producto" : "productos"}`}
    </button>
  ) : (
    <button type="button" onClick={search} disabled={loading || !url.trim()} className="p-press w-full rounded-full bg-[var(--p-brand)] py-3 text-sm font-semibold text-white disabled:opacity-50">
      {loading ? "Buscando…" : "Buscar productos"}
    </button>
  );

  return (
    <Sheet title="Importar de Last.app" onClose={onClose} footer={footer} wide>
      {result ? (
        <div className="space-y-2 py-2 text-sm">
          <p className="text-base font-semibold">Importación terminada</p>
          <p>📷 {result.photos} fotos · ⚠️ {result.allergens} productos con alérgenos · 🌱 {result.diet} con sellos</p>
          {result.failed.length > 0 && <p className="text-[var(--p-muted)]">Sin foto (no se pudo descargar): {result.failed.join(", ")}</p>}
          <p className="text-[var(--p-muted)]">Revisa los alérgenos de cada producto en Carta: los importados se suman a los que ya tenías.</p>
        </div>
      ) : !data ? (
        <div className="space-y-3 py-1">
          <p className="text-sm text-[var(--p-muted)]">Pega la dirección de tu tienda en Last.app. Traemos las fotos, los alérgenos y los sellos (vegano, vegetariano, sin gluten) de los productos que se llamen igual que los tuyos.</p>
          <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && url.trim() && search()} placeholder="https://tutienda.last.shop" inputMode="url" aria-label="Dirección de tu tienda en Last.app" className="w-full rounded-xl border border-[var(--p-line)] bg-transparent px-3 py-2.5 text-[15px] outline-none focus:border-[var(--p-brand)]" />
          {error && <p className="text-sm text-[var(--p-accent)]" role="alert">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3 py-1">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["photos", "Fotos"],
                ["allergens", "Alérgenos"],
                ["diet", "Sellos"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={what[k]} onClick={() => setWhat({ ...what, [k]: !what[k] })} className={`p-press rounded-full border px-3.5 py-1.5 text-sm font-medium ${what[k] ? "border-[var(--p-brand)] bg-[var(--p-brand-soft)] text-[var(--p-brand)]" : "border-[var(--p-line)] text-[var(--p-muted)]"}`}>
                {what[k] ? "✓ " : ""}
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--p-muted)]">
            {chosen.length} de {data.products.length} productos con pareja en Last. Cambia la pareja o elige «No importar» en cada uno.
            {what.photos && " La foto importada sustituye a la que tengas."}
          </p>
          {error && <p className="text-sm text-[var(--p-accent)]" role="alert">{error}</p>}
          <ul className="divide-y divide-[var(--p-line)] rounded-2xl border border-[var(--p-line)]">
            {data.products.map((p) => {
              const l = pick[p.id] ? lastByName.get(pick[p.id]) : undefined;
              return (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {l?.thumb ? <img src={l.thumb} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" /> : <span className="h-12 w-12 shrink-0 rounded-lg bg-black/[0.05]" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {p.name} <span className="font-normal text-[var(--p-faint)]">· {p.category}</span>
                    </p>
                    <select value={pick[p.id] ?? ""} onChange={(e) => setPick({ ...pick, [p.id]: e.target.value })} aria-label={`Pareja en Last de ${p.name}`} className="mt-1 w-full min-w-0 truncate rounded-lg border border-[var(--p-line)] bg-transparent px-2 py-1 text-[13px]">
                      <option value="">— No importar —</option>
                      {data.last.map((x) => (
                        <option key={x.name} value={x.name}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                    {l && (l.allergens.length > 0 || l.diet.length > 0) && (
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <DietBadges tags={l.diet} size={18} />
                        <AllergenRow names={l.allergens} size={18} max={14} />
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
