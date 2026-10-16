"use client";

import { useMemo, useRef, useState } from "react";
import { lineMismatch, type ScanResult } from "@/app/lib/invoice";
import { priceChangePct } from "@/app/lib/purchasing";
import { UNIT_LABEL, euros, type Overview } from "./types";

// Lectura de albaranes con IA (fase 4): foto → revisión → stock y precios.

const MAX_SIDE = 2000; // px: suficiente para leer el texto y ligero de enviar
const MAX_PDF_BYTES = 3_900_000;

type Row = {
  description: string;
  ingredientId: string;
  quantity: string;
  price: string; // € por formato
  lineTotalCents: number | null;
  note: string | null;
  include: boolean;
};

const toEurosInput = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2).replace(".", ","));
const parseNum = (v: string) => Number(v.replace(",", "."));

// Reduce la foto en el propio móvil y la devuelve en base64 (JPEG).
async function imageToBase64(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("No se pudo abrir la imagen"));
      i.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export default function Albaran({ data, api, onSaved }: { data: Overview; api: string; onSaved: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"idle" | "reading" | "review" | "applying">("idle");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const ingredients = useMemo(() => new Map(data.ingredients.map((i) => [i.id, i])), [data.ingredients]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setDone("");
    const isPdf = file.type === "application/pdf";
    if (isPdf && file.size > MAX_PDF_BYTES) {
      setError("El PDF pesa más de 4 MB. Prueba con una foto de cada página.");
      return;
    }
    setStage("reading");
    try {
      const body = isPdf
        ? { mediaType: "application/pdf", data: await fileToBase64(file) }
        : { mediaType: "image/jpeg", data: await imageToBase64(file) };
      const res = await fetch(`${api}/invoice-scan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo leer el documento");
      const result = json.result as ScanResult;
      setScan(result);
      setSupplierId(result.supplierId ?? "");
      setDocNumber(result.documentNumber ?? "");
      setRows(
        result.lines.map((l) => ({
          description: l.description,
          ingredientId: l.ingredientId ?? "",
          quantity: l.quantity != null ? String(Math.round(l.quantity * 1000) / 1000).replace(".", ",") : "",
          price: toEurosInput(l.packPriceCents),
          lineTotalCents: l.lineTotalCents,
          note: l.note,
          include: !!l.ingredientId && l.quantity != null,
        }))
      );
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el documento");
      setStage("idle");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const ready = rows.filter((r) => r.include && r.ingredientId && parseNum(r.quantity) >= 0 && r.quantity.trim() !== "");
  const includedTotal = ready.reduce((acc, r) => {
    const ing = ingredients.get(r.ingredientId);
    const price = parseNum(r.price);
    return ing && price >= 0 && ing.packSize > 0 ? acc + (parseNum(r.quantity) / ing.packSize) * price * 100 : acc;
  }, 0);

  async function apply() {
    setStage("applying");
    setError("");
    try {
      const res = await fetch(`${api}/invoice-apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplierId || null,
          documentNumber: docNumber || null,
          lines: ready.map((r) => ({
            ingredientId: r.ingredientId,
            quantity: parseNum(r.quantity),
            packPriceCents: r.price.trim() ? Math.round(parseNum(r.price) * 100) : null,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo aplicar el albarán");
      await onSaved();
      setDone(
        `Albarán aplicado: ${json.stockLines} ${json.stockLines === 1 ? "entrada" : "entradas"} de stock` +
          (json.priceChanges ? ` y ${json.priceChanges} ${json.priceChanges === 1 ? "precio actualizado" : "precios actualizados"}.` : ".")
      );
      setScan(null);
      setRows([]);
      setStage("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar el albarán");
      setStage("review");
    }
  }

  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <section className="rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      {stage !== "review" && stage !== "applying" && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[17px] font-semibold">Leer albarán o factura</h2>
            <p className="text-sm text-[var(--p-muted)]">
              Haz una foto y la IA rellena las cantidades y los precios. Tú lo revisas antes de aplicarlo.
            </p>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!data.aiEnabled || stage === "reading" || data.ingredients.length === 0}
            className="p-press shrink-0 self-start rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:self-auto"
          >
            {stage === "reading" ? "Leyendo…" : "📷 Hacer foto o subir"}
          </button>
        </div>
      )}
      {stage === "reading" && (
        <p className="mt-3 rounded-xl bg-[var(--p-brand-soft)] px-4 py-3 text-sm text-[var(--p-brand)]">
          Leyendo el documento… suele tardar entre 20 y 40 segundos.
        </p>
      )}
      {!data.aiEnabled && <p className="mt-2 text-xs text-[var(--p-muted)]">La lectura con IA se activará en cuanto esté configurada.</p>}
      {data.aiEnabled && data.ingredients.length === 0 && (
        <p className="mt-2 text-xs text-[var(--p-muted)]">Primero da de alta tus ingredientes para poder relacionar las líneas del albarán.</p>
      )}
      {done && <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{done}</p>}

      {(stage === "review" || stage === "applying") && scan && (
        <div>
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-[17px] font-semibold">Revisa el albarán</h2>
            <button onClick={() => { setStage("idle"); setScan(null); }} className="rounded-full px-3 py-1 text-sm text-[var(--p-muted)] hover:bg-black/[0.04]">
              Descartar
            </button>
          </div>
          <p className="text-sm text-[var(--p-muted)]">Comprueba cada línea. Solo se aplican las marcadas.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block text-[13px] font-medium text-[var(--p-muted)]">
              Proveedor
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="mt-1 block w-full rounded-lg px-3 py-2 text-sm text-[var(--p-ink)]">
                <option value="">{scan.supplierName ? `Sin asignar (${scan.supplierName})` : "Sin asignar"}</option>
                {data.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-[13px] font-medium text-[var(--p-muted)]">
              Nº de albarán
              <input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} className="mt-1 block w-full rounded-lg px-3 py-2 text-sm text-[var(--p-ink)]" />
            </label>
            <div className="text-[13px] font-medium text-[var(--p-muted)]">
              Fecha
              <p className="mt-1 py-2 text-sm text-[var(--p-ink)]">{scan.documentDate ? new Date(scan.documentDate).toLocaleDateString("es-ES") : "—"}</p>
            </div>
          </div>

          <ul className="mt-4 space-y-3">
            {rows.map((r, i) => {
              const ing = ingredients.get(r.ingredientId);
              const price = parseNum(r.price);
              const pct = ing && r.price.trim() && price >= 0 ? priceChangePct({ oldPackSize: ing.packSize, oldPackPriceCents: ing.packPriceCents, newPackSize: ing.packSize, newPackPriceCents: Math.round(price * 100) }) : 0;
              const mismatch = ing ? lineMismatch({ quantity: parseNum(r.quantity), packPriceCents: Math.round(price * 100), lineTotalCents: r.lineTotalCents }, ing.packSize) : false;
              return (
                <li key={i} className={`rounded-xl border p-3 ${r.include ? "border-[var(--p-brand)]/30 bg-[var(--p-brand-soft)]/40" : "border-[var(--p-line)]"}`}>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" checked={r.include} onChange={(e) => update(i, { include: e.target.checked })} className="mt-1 h-4 w-4 accent-[var(--p-brand)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{r.description}</span>
                      {r.lineTotalCents != null && <span className="text-xs text-[var(--p-muted)]">Importe en el albarán: {euros(r.lineTotalCents)}</span>}
                    </span>
                  </label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_9rem_9rem] sm:items-end">
                    <select
                      value={r.ingredientId}
                      onChange={(e) => update(i, { ingredientId: e.target.value, include: !!e.target.value && r.quantity.trim() !== "" })}
                      className="min-w-0 rounded-lg px-2 py-2 text-sm"
                    >
                      <option value="">— Sin ingrediente (no se aplica) —</option>
                      {data.ingredients.map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </select>
                    <label className="block text-[11px] font-medium text-[var(--p-muted)]">
                      Cantidad recibida
                      <span className="mt-0.5 flex items-center gap-1">
                        <input inputMode="decimal" value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value })} className="w-full min-w-0 rounded-lg px-2 py-2 text-sm text-[var(--p-ink)]" />
                        <span className="w-6 text-xs">{ing ? UNIT_LABEL[ing.baseUnit] : ""}</span>
                      </span>
                    </label>
                    <label className="block text-[11px] font-medium text-[var(--p-muted)]">
                      Precio del formato
                      <span className="mt-0.5 flex items-center gap-1">
                        <input inputMode="decimal" value={r.price} onChange={(e) => update(i, { price: e.target.value })} className="w-full min-w-0 rounded-lg px-2 py-2 text-sm text-[var(--p-ink)]" />
                        <span className="w-6 text-xs">€</span>
                      </span>
                    </label>
                  </div>
                  {ing && (
                    <p className="mt-1 text-xs text-[var(--p-muted)]">
                      Precio por formato de {ing.packSize} {UNIT_LABEL[ing.baseUnit]} · ahora {euros(ing.packPriceCents)}
                      {Math.abs(pct) >= 0.5 && (
                        <span className={`ml-1 font-semibold ${pct > 0 ? "text-[var(--p-accent)]" : "text-emerald-700"}`}>
                          ({pct > 0 ? "+" : ""}{pct.toFixed(1).replace(".", ",")} %)
                        </span>
                      )}
                    </p>
                  )}
                  {mismatch && <p className="mt-1 text-xs text-amber-700">La cantidad × precio no cuadra con el importe del albarán. Revísalo.</p>}
                  {r.note && <p className="mt-1 text-xs text-amber-700">{r.note}</p>}
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-col gap-3 border-t border-[var(--p-line)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--p-muted)]">
              {ready.length} {ready.length === 1 ? "línea marcada" : "líneas marcadas"} · {euros(Math.round(includedTotal))}
              {scan.totalCents != null && <> · total del albarán {euros(scan.totalCents)} (sin IVA)</>}
            </p>
            <button onClick={apply} disabled={stage === "applying" || ready.length === 0} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {stage === "applying" ? "Aplicando…" : "Aplicar: entrada de stock y precios"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-[var(--p-accent)]">{error}</p>}
    </section>
  );
}
