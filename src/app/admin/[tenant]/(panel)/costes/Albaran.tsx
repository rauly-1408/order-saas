"use client";

import { useMemo, useRef, useState } from "react";
import { invoiceCheck, lineMismatch, lineVatCents, type LineKind, type ScanResult } from "@/app/lib/invoice";
import { priceChangePct } from "@/app/lib/purchasing";
import { UNIT_LABEL, euros, type BaseUnit, type Overview } from "./types";

// Lectura de albaranes con IA (fase 4): foto → revisión → stock y precios.
// Las líneas sin ingrediente llegan con una propuesta de ingrediente nuevo
// (nombre, unidad, formato, precio) que se da de alta al aplicar.

const MAX_SIDE = 2000; // px: suficiente para leer el texto y ligero de enviar
const MAX_PDF_BYTES = 3_900_000;
const NEW = "__new__"; // valor del select para «crear nuevo»

type NewIng = { name: string; baseUnit: BaseUnit; packSize: string; price: string; allergens: string[] };
type Row = {
  description: string;
  kind: LineKind; // EXPENSE: limpieza, bolsas… cuenta en la factura pero no entra al stock
  docQuantity: number | null; // tal cual en la factura
  docUnit: string | null;
  unitPrice: number | null; // € sin IVA
  vatPct: number | null;
  lineTotalWithVatCents: number | null;
  ingredientId: string;
  newIng: NewIng | null; // ingrediente nuevo que se creará (solo si no hay ingredientId)
  quantity: string;
  price: string; // € por formato
  lineTotalCents: number | null;
  note: string | null;
  include: boolean;
  // Línea de gasto (bolsas, limpieza…) que se mete en Consumibles: el consumible o uno nuevo.
  consumableId: string; // "" = gasto sin stock; NEW = nuevo
};

// Tipo de consumible probable por el texto de la factura.
const guessCategory = (d: string) =>
  /bolsa|caja|envase|envolt|film|aluminio|vaso|tapa|cubierto|pajita/i.test(d) ? "Packaging" : /amoniac|friegasuel|deterg|lej[ií]a|suaviz|limp|lavavaj|bayeta|estropajo|desengras/i.test(d) ? "Limpieza" : /papel|higi[eé]nic|servillet|rollo|secaman/i.test(d) ? "Papel y servilletas" : /bobina|ticket|t[eé]rmic/i.test(d) ? "Impresora" : "Otros";
const titleCase = (d: string) => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase();

const toEurosInput = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2).replace(".", ","));
const parseNum = (v: string) => Number(v.replace(",", "."));
const num = (n: number, max = 4) => n.toLocaleString("es-ES", { maximumFractionDigits: max });
const pctText = (p: number) => `${num(p, 1)} %`;

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

export default function Albaran({ data, api, onSaved, onInvoice }: { data: Overview; api: string; onSaved: () => Promise<void>; onInvoice?: () => void }) {
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
      // Sin proveedor conocido pero con nombre en el documento: se propone crearlo.
      setSupplierId(result.supplierId ?? (result.supplierName ? NEW : ""));
      setDocNumber(result.documentNumber ?? "");
      setRows(
        result.lines.map((l) => ({
          description: l.description,
          kind: l.kind,
          docQuantity: l.docQuantity,
          docUnit: l.docUnit,
          unitPrice: l.unitPrice,
          vatPct: l.vatPct,
          lineTotalWithVatCents: l.lineTotalWithVatCents,
          ingredientId: l.ingredientId ?? "",
          newIng: l.newIngredient
            ? { name: l.newIngredient.name, baseUnit: l.newIngredient.baseUnit, packSize: String(l.newIngredient.packSize).replace(".", ","), price: toEurosInput(l.newIngredient.packPriceCents), allergens: l.newIngredient.allergens }
            : null,
          quantity: l.quantity != null ? String(Math.round(l.quantity * 1000) / 1000).replace(".", ",") : "",
          price: toEurosInput(l.packPriceCents),
          lineTotalCents: l.lineTotalCents,
          note: l.note,
          include: l.kind === "INGREDIENT" && (!!l.ingredientId || !!l.newIngredient) && l.quantity != null,
          consumableId: "",
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

  const newIngOk = (n: NewIng | null) => !!n && n.name.trim() !== "" && parseNum(n.packSize) > 0 && n.price.trim() !== "" && parseNum(n.price) >= 0;
  const ready = rows.filter((r) => r.kind === "INGREDIENT" && r.include && (r.ingredientId || newIngOk(r.newIng)) && parseNum(r.quantity) >= 0 && r.quantity.trim() !== "");
  const consumables = data.ingredients.filter((i) => i.kind === "CONSUMABLE");
  const toConsumables = rows.filter((r) => r.kind === "EXPENSE" && r.consumableId && parseNum(r.quantity) > 0);
  const includedTotal = ready.reduce((acc, r) => {
    const ing = ingredients.get(r.ingredientId);
    const packSize = ing ? ing.packSize : parseNum(r.newIng!.packSize);
    const price = ing ? parseNum(r.price) : parseNum(r.newIng!.price);
    return price >= 0 && packSize > 0 ? acc + (parseNum(r.quantity) / packSize) * price * 100 : acc;
  }, 0);
  const toCreate = ready.filter((r) => !r.ingredientId).length;
  const check = scan ? invoiceCheck({ totalCents: scan.totalCents, totalWithVatCents: scan.totalWithVatCents, lines: rows }) : null;
  const expenseCount = rows.filter((r) => r.kind === "EXPENSE").length;

  async function apply() {
    setStage("applying");
    setError("");
    try {
      const res = await fetch(`${api}/invoice-apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplierId && supplierId !== NEW ? supplierId : null,
          newSupplierName: supplierId === NEW ? scan?.supplierName ?? null : null,
          documentNumber: docNumber || null,
          // La factura entera, tal cual, para guardarla con su IVA.
          invoice: scan && {
            supplierName: scan.supplierName,
            supplierTaxId: scan.supplierTaxId,
            number: docNumber || scan.documentNumber,
            date: scan.documentDate,
            baseCents: scan.totalCents,
            vatCents: scan.vatCents,
            totalCents: scan.totalWithVatCents,
            vatBreakdown: scan.vatBreakdown,
            lines: rows.map((r) => ({
              description: r.description,
              kind: r.kind,
              docQuantity: r.docQuantity,
              docUnit: r.docUnit,
              unitPrice: r.unitPrice,
              vatPct: r.vatPct,
              lineTotalCents: r.lineTotalCents,
              lineTotalWithVatCents: r.lineTotalWithVatCents,
              ingredientId: r.kind === "INGREDIENT" && r.include ? r.ingredientId || null : null,
            })),
          },
          lines: [
            ...toConsumables.map((r) =>
              r.consumableId !== NEW
                ? { ingredientId: r.consumableId, quantity: parseNum(r.quantity), packPriceCents: null }
                : {
                    newIngredient: { name: titleCase(r.description).slice(0, 80), baseUnit: "UNIT", packSize: 1, packPriceCents: Math.round((r.unitPrice ?? 0) * 100), allergens: [], kind: "CONSUMABLE", category: guessCategory(r.description) },
                    quantity: parseNum(r.quantity),
                    packPriceCents: null,
                  }
            ),
            ...ready.map((r) =>
            r.ingredientId
              ? { ingredientId: r.ingredientId, quantity: parseNum(r.quantity), packPriceCents: r.price.trim() ? Math.round(parseNum(r.price) * 100) : null }
              : {
                  newIngredient: { name: r.newIng!.name.trim(), baseUnit: r.newIng!.baseUnit, packSize: parseNum(r.newIng!.packSize), packPriceCents: Math.round(parseNum(r.newIng!.price) * 100), allergens: r.newIng!.allergens },
                  quantity: parseNum(r.quantity),
                  packPriceCents: null,
                }
          ),
          ],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo aplicar el albarán");
      await onSaved();
      onInvoice?.();
      setDone(
        (json.invoiceSaved && json.totalCents != null ? `Factura guardada: ${euros(json.totalCents)}${json.vatCents != null ? ` (IVA ${euros(json.vatCents)})` : ""}. ` : "") +
        (json.stockLines || json.created || json.priceChanges ? `${json.stockLines} ${json.stockLines === 1 ? "línea" : "líneas"} al stock` +
          (json.created ? `, ${json.created} ${json.created === 1 ? "ingrediente nuevo" : "ingredientes nuevos"}` : "") +
          (json.priceChanges ? ` y ${json.priceChanges} ${json.priceChanges === 1 ? "precio actualizado" : "precios actualizados"}` : "") +
          (json.supplierCreated ? ". Proveedor dado de alta." : ".") : json.supplierCreated ? "Proveedor dado de alta." : "")
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
              Haz una foto y la IA rellena las cantidades y los precios. Lo que aún no tengas se da de alta como ingrediente nuevo. Tú lo revisas antes de aplicarlo.
            </p>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!data.aiEnabled || stage === "reading"}
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
      {done && <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{done}</p>}

      {(stage === "review" || stage === "applying") && scan && (
        <div>
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-[17px] font-semibold">Revisa la factura</h2>
            <button onClick={() => { setStage("idle"); setScan(null); }} className="rounded-full px-3 py-1 text-sm text-[var(--p-muted)] hover:bg-black/[0.04]">
              Descartar
            </button>
          </div>
          <p className="text-sm text-[var(--p-muted)]">Comprueba cada línea. Solo se aplican las marcadas. Las que no tengas aún se crean como ingredientes nuevos.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block text-[13px] font-medium text-[var(--p-muted)]">
              Proveedor
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="mt-1 block w-full rounded-lg px-3 py-2 text-sm text-[var(--p-ink)]">
                <option value="">{scan.supplierName ? `Sin asignar (${scan.supplierName})` : "Sin asignar"}</option>
                {scan.supplierName && !scan.supplierId && <option value={NEW}>➕ Crear proveedor «{scan.supplierName}»</option>}
                {data.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-[13px] font-medium text-[var(--p-muted)]">
              Nº de factura o albarán
              <input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} className="mt-1 block w-full rounded-lg px-3 py-2 text-sm text-[var(--p-ink)]" />
            </label>
            <div className="text-[13px] font-medium text-[var(--p-muted)]">
              Fecha
              <p className="mt-1 py-2 text-sm text-[var(--p-ink)]">{scan.documentDate ? new Date(scan.documentDate).toLocaleDateString("es-ES") : "—"}</p>
            </div>
          </div>

          {/* La factura como la ve la gestoría: base, IVA por tipo y total, y si las líneas cuadran. */}
          <div className="mt-4 rounded-xl bg-black/[0.03] p-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[11px] font-medium text-[var(--p-muted)]">Base (sin IVA)</p>
                <p className="text-base font-semibold tabular-nums">{scan.totalCents != null ? euros(scan.totalCents) : "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-[var(--p-muted)]">IVA</p>
                <p className="text-base font-semibold tabular-nums">{scan.vatCents != null ? euros(scan.vatCents) : "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-[var(--p-muted)]">Total factura</p>
                <p className="text-base font-semibold tabular-nums">{scan.totalWithVatCents != null ? euros(scan.totalWithVatCents) : "—"}</p>
              </div>
            </div>
            {scan.vatBreakdown.length > 0 && (
              <p className="mt-2 text-center text-xs text-[var(--p-muted)] tabular-nums">
                {scan.vatBreakdown.map((v) => `IVA ${pctText(v.pct)}: ${euros(v.vatCents)} de ${euros(v.baseCents)}`).join(" · ")}
              </p>
            )}
            {check && (
              <p className={`mt-2 rounded-lg px-3 py-2 text-center text-xs font-semibold ${check.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                {check.ok
                  ? `✓ Las ${rows.length} líneas suman lo mismo que la factura`
                  : check.diffCents != null
                    ? `Las líneas no cuadran con el total: ${check.diffCents > 0 ? "faltan" : "sobran"} ${euros(Math.abs(check.diffCents))}. Revisa si falta alguna línea o un descuento.`
                    : "No he podido comprobar el total. Revisa las líneas."}
              </p>
            )}
            {expenseCount > 0 && <p className="mt-2 text-center text-xs text-[var(--p-muted)]">{expenseCount} {expenseCount === 1 ? "línea es un gasto" : "líneas son gastos"} (limpieza, bolsas…): cuentan en la factura pero no entran al stock.</p>}
          </div>

          <ul className="mt-4 space-y-3">
            {rows.map((r, i) => {
              const ing = ingredients.get(r.ingredientId);
              const price = parseNum(r.price);
              const pct = ing && r.price.trim() && price >= 0 ? priceChangePct({ oldPackSize: ing.packSize, oldPackPriceCents: ing.packPriceCents, newPackSize: ing.packSize, newPackPriceCents: Math.round(price * 100) }) : 0;
              const mismatch = ing ? lineMismatch({ quantity: parseNum(r.quantity), packPriceCents: Math.round(price * 100), lineTotalCents: r.lineTotalCents }, ing.packSize) : false;
              return (
                <li key={i} className={`rounded-xl border p-3 ${r.include ? "border-[var(--p-brand)]/30 bg-[var(--p-brand-soft)]/40" : "border-[var(--p-line)]"}`}>
                  <div className="flex items-start gap-2">
                    {r.kind === "INGREDIENT" ? (
                      <input type="checkbox" checked={r.include} onChange={(e) => update(i, { include: e.target.checked })} aria-label={`Meter «${r.description}» en el stock`} className="mt-1 h-4 w-4 shrink-0 accent-[var(--p-brand)]" />
                    ) : (
                      <span className="mt-0.5 shrink-0 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-semibold text-[var(--p-muted)]">Gasto</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{r.description}</p>
                      {/* Lo que pone la factura, sin convertir: así se reconoce lo comprado. */}
                      <p className="text-xs text-[var(--p-muted)] tabular-nums">
                        {r.docQuantity != null && <>{num(r.docQuantity, 3)} {r.docUnit ?? "ud."}</>}
                        {r.unitPrice != null && <> × {num(r.unitPrice)} €</>}
                        {r.lineTotalCents != null && <> = {euros(r.lineTotalCents)}</>}
                        {r.vatPct != null && <> + IVA {pctText(r.vatPct)}{lineVatCents(r) != null && <> ({euros(lineVatCents(r)!)})</>}</>}
                        {r.lineTotalWithVatCents != null && <> · <span className="font-semibold text-[var(--p-ink)]">{euros(r.lineTotalWithVatCents)}</span></>}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => update(i, r.kind === "EXPENSE" ? { kind: "INGREDIENT", include: false } : { kind: "EXPENSE", include: false })}
                      className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[var(--p-brand)] hover:bg-[var(--p-brand-soft)]"
                    >
                      {r.kind === "EXPENSE" ? "Es un ingrediente" : "No es ingrediente"}
                    </button>
                  </div>
                  {r.kind === "EXPENSE" && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_9rem] sm:items-end">
                      <select
                        value={r.consumableId}
                        onChange={(e) => update(i, { consumableId: e.target.value, quantity: r.quantity.trim() ? r.quantity : String(r.docQuantity ?? 1).replace(".", ",") })}
                        aria-label={`Consumible para «${r.description}»`}
                        className="min-w-0 rounded-lg px-2 py-2 text-sm"
                      >
                        <option value="">Gasto: no entra al stock</option>
                        <option value={NEW}>➕ Nuevo consumible «{titleCase(r.description).slice(0, 40)}» ({guessCategory(r.description)})</option>
                        {consumables.map((x) => (
                          <option key={x.id} value={x.id}>Consumibles: {x.name}</option>
                        ))}
                      </select>
                      {r.consumableId && (
                        <label className="block text-[11px] font-medium text-[var(--p-muted)]">
                          Entra al stock
                          <input inputMode="decimal" value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value })} className="mt-0.5 w-full min-w-0 rounded-lg px-2 py-2 text-sm text-[var(--p-ink)]" />
                        </label>
                      )}
                      {!r.consumableId && <p className="text-xs text-[var(--p-muted)] sm:col-span-2">Cuenta en la factura y en el IVA. Si es packaging, limpieza o papel, mételo en Consumibles para llevar su stock.</p>}
                    </div>
                  )}
                  {r.kind === "INGREDIENT" && (
                  <>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_9rem_9rem] sm:items-end">
                    <select
                      value={r.ingredientId || (r.newIng ? NEW : "")}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === NEW) update(i, { ingredientId: "", newIng: r.newIng ?? { name: r.description.slice(0, 80), baseUnit: "G", packSize: "", price: r.price, allergens: [] }, include: r.quantity.trim() !== "" });
                        else update(i, { ingredientId: v, newIng: null, include: !!v && r.quantity.trim() !== "" });
                      }}
                      className="min-w-0 rounded-lg px-2 py-2 text-sm"
                    >
                      <option value="">— Sin ingrediente (no se aplica) —</option>
                      <option value={NEW}>➕ Ingrediente nuevo</option>
                      {data.ingredients.map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </select>
                    <label className="block text-[11px] font-medium text-[var(--p-muted)]">
                      Entra al stock
                      <span className="mt-0.5 flex items-center gap-1">
                        <input inputMode="decimal" value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value })} className="w-full min-w-0 rounded-lg px-2 py-2 text-sm text-[var(--p-ink)]" />
                        <span className="w-6 text-xs">{ing ? UNIT_LABEL[ing.baseUnit] : r.newIng ? UNIT_LABEL[r.newIng.baseUnit] : ""}</span>
                      </span>
                    </label>
                    {!r.newIng && (
                      <label className="block text-[11px] font-medium text-[var(--p-muted)]">
                        Precio del formato
                        <span className="mt-0.5 flex items-center gap-1">
                          <input inputMode="decimal" value={r.price} onChange={(e) => update(i, { price: e.target.value })} className="w-full min-w-0 rounded-lg px-2 py-2 text-sm text-[var(--p-ink)]" />
                          <span className="w-6 text-xs">€</span>
                        </span>
                      </label>
                    )}
                  </div>
                  {r.newIng && (
                    <div className="mt-2 grid gap-2 rounded-lg bg-[var(--p-surface)] p-2 sm:grid-cols-[1fr_7rem_8rem_8rem]">
                      <label className="block text-[11px] font-medium text-[var(--p-muted)]">
                        Nombre del ingrediente nuevo
                        <input value={r.newIng.name} onChange={(e) => update(i, { newIng: { ...r.newIng!, name: e.target.value } })} className="mt-0.5 w-full min-w-0 rounded-lg px-2 py-2 text-sm text-[var(--p-ink)]" />
                      </label>
                      <label className="block text-[11px] font-medium text-[var(--p-muted)]">
                        Unidad
                        <select value={r.newIng.baseUnit} onChange={(e) => update(i, { newIng: { ...r.newIng!, baseUnit: e.target.value as BaseUnit } })} className="mt-0.5 w-full rounded-lg px-2 py-2 text-sm text-[var(--p-ink)]">
                          {(Object.keys(UNIT_LABEL) as BaseUnit[]).map((u) => (
                            <option key={u} value={u}>{UNIT_LABEL[u]}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-[11px] font-medium text-[var(--p-muted)]">
                        Formato de compra
                        <span className="mt-0.5 flex items-center gap-1">
                          <input inputMode="decimal" value={r.newIng.packSize} onChange={(e) => update(i, { newIng: { ...r.newIng!, packSize: e.target.value } })} className="w-full min-w-0 rounded-lg px-2 py-2 text-sm text-[var(--p-ink)]" />
                          <span className="w-6 text-xs">{UNIT_LABEL[r.newIng.baseUnit]}</span>
                        </span>
                      </label>
                      <label className="block text-[11px] font-medium text-[var(--p-muted)]">
                        Precio del formato
                        <span className="mt-0.5 flex items-center gap-1">
                          <input inputMode="decimal" value={r.newIng.price} onChange={(e) => update(i, { newIng: { ...r.newIng!, price: e.target.value } })} className="w-full min-w-0 rounded-lg px-2 py-2 text-sm text-[var(--p-ink)]" />
                          <span className="w-6 text-xs">€</span>
                        </span>
                      </label>
                      {r.newIng.allergens.length > 0 && <p className="text-[11px] text-[var(--p-muted)] sm:col-span-4">Alérgenos detectados: {r.newIng.allergens.join(", ")}</p>}
                    </div>
                  )}
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
                  </>
                  )}
                  {mismatch && <p className="mt-1 text-xs text-amber-700">La cantidad × precio no cuadra con el importe del albarán. Revísalo.</p>}
                  {r.note && <p className="mt-1 text-xs text-amber-700">{r.note}</p>}
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-col gap-3 border-t border-[var(--p-line)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--p-muted)]">
              Al stock: {ready.length} {ready.length === 1 ? "línea" : "líneas"}
              {toCreate > 0 && <> ({toCreate} {toCreate === 1 ? "ingrediente nuevo" : "ingredientes nuevos"})</>} · {euros(Math.round(includedTotal))} sin IVA
            </p>
            <button onClick={apply} disabled={stage === "applying" || rows.length === 0} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {stage === "applying" ? "Guardando…" : ready.length || toConsumables.length ? "Guardar factura y meter en stock" : "Guardar factura"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-[var(--p-accent)]">{error}</p>}
    </section>
  );
}
