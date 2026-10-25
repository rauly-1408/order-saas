"use client";

import { ask } from "@/app/lib/dialog";
import { useMemo, useState } from "react";
import { unitCostCents } from "@/app/lib/costs";
import { prepCost } from "@/app/lib/preps";
import { UNIT_LABEL, euros, type BaseUnit, type Ingredient, type Overview } from "./types";
import AllergenIcon from "./AllergenIcon";

// Elaboraciones: recetas por lotes (salsa boloñesa, cochinita, caldo, pico de
// gallo…). Ingredientes del lote + otros costes (mano de obra, horno, envases,
// maquila) ÷ lo que rinde = coste por kilo o por ración. Después se usan en los
// escandallos como un ingrediente más. Ver docs/MODULO-COSTES.md

// Cómo se escribe una cantidad: en kg o g (se guarda en g), en l o ml (en ml) o en unidades.
type Shown = "kg" | "g" | "l" | "ml" | "ud";
const FACTOR: Record<Shown, number> = { kg: 1000, g: 1, l: 1000, ml: 1, ud: 1 };
const BASE_OF: Record<Shown, BaseUnit> = { kg: "G", g: "G", l: "ML", ml: "ML", ud: "UNIT" };
const SHOWN_FOR: Record<BaseUnit, Shown[]> = { G: ["kg", "g"], KG: ["kg"], ML: ["l", "ml"], L: ["l"], UNIT: ["ud"] };
const EXTRA_HINTS = ["Mano de obra", "Horno / energía", "Envases y bolsas", "Maquila"];

type LineDraft = { ingredientId: string; qty: string; shown: Shown };
type Form = { id: string | null; name: string; yieldQty: string; yieldShown: Shown; lines: LineDraft[]; extras: { label: string; euros: string }[]; notes: string };

const input = "w-full min-w-0 rounded-lg border border-[var(--p-line)] px-3 py-2 text-sm outline-none focus:border-[var(--p-brand)]";
const label = "mb-1 block text-[13px] font-medium text-[var(--p-muted)]";
const num = (v: string) => Number(v.replace(",", "."));
const fmt = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 3 });

// Cantidad en la unidad base → cómo se enseña (50 000 g → 50 kg).
function toShown(q: number, base: BaseUnit): { qty: string; shown: Shown } {
  if (base === "G") return q >= 1000 ? { qty: fmt(q / 1000), shown: "kg" } : { qty: fmt(q), shown: "g" };
  if (base === "ML") return q >= 1000 ? { qty: fmt(q / 1000), shown: "l" } : { qty: fmt(q), shown: "ml" };
  if (base === "KG") return { qty: fmt(q), shown: "kg" };
  if (base === "L") return { qty: fmt(q), shown: "l" };
  return { qty: fmt(q), shown: "ud" };
}
// …y al revés, a la unidad base del ingrediente.
function toBase(qty: string, shown: Shown, base: BaseUnit): number {
  const n = num(qty);
  if (!(n > 0)) return 0;
  if (base === "KG" || base === "L" || base === "UNIT") return n;
  return n * FACTOR[shown];
}
function perUnitText(cents: number, base: BaseUnit): string {
  if (base === "G") return `${euros(cents * 1000)}/kg`;
  if (base === "ML") return `${euros(cents * 1000)}/l`;
  return `${euros(cents)}/${UNIT_LABEL[base]}`;
}

export default function Elaboraciones({ data, api, onSaved, onGoToIngredients }: { data: Overview; api: string; onSaved: () => Promise<void>; onGoToIngredients: () => void }) {
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const byId = useMemo(() => new Map(data.ingredients.map((i) => [i.id, i])), [data.ingredients]);
  const preps = data.ingredients.filter((i) => i.isPrep);
  const usedIn = (id: string) =>
    data.categories.flatMap((c) => c.products).filter((p) => p.recipeLines.some((l) => l.ingredientId === id)).length +
    data.ingredients.filter((i) => i.prepLines.some((l) => l.ingredientId === id)).length;

  function open(p: Ingredient | null) {
    setError("");
    requestAnimationFrame(() => document.getElementById("costes-form")?.scrollIntoView({ block: "start" }));
    if (!p) {
      setForm({ id: null, name: "", yieldQty: "", yieldShown: "kg", lines: [{ ingredientId: "", qty: "", shown: "kg" }], extras: [], notes: "" });
      return;
    }
    const y = toShown(p.packSize, p.baseUnit);
    setForm({
      id: p.id,
      name: p.name,
      yieldQty: y.qty,
      yieldShown: y.shown,
      lines: p.prepLines.map((l) => {
        const ing = byId.get(l.ingredientId);
        return { ingredientId: l.ingredientId, ...toShown(l.quantity, ing?.baseUnit ?? "G") };
      }),
      extras: p.prepExtras.map((e) => ({ label: e.label, euros: (e.cents / 100).toFixed(2).replace(".", ",") })),
      notes: p.prepNotes ?? "",
    });
  }

  if (data.ingredients.filter((i) => !i.isPrep).length === 0 && !preps.length) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 bg-[var(--p-surface)]/60 p-6 text-center">
        <p className="font-semibold">Primero crea tus ingredientes</p>
        <p className="mt-1 text-sm text-[var(--p-muted)]">Una elaboración (una salsa, un caldo…) se hace con tus ingredientes.</p>
        <button onClick={onGoToIngredients} className="mt-4 p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white">
          Ir a ingredientes
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!form && (
        <div className="flex flex-col gap-3 rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[17px] font-semibold">Elaboraciones</h2>
            <p className="text-sm text-[var(--p-muted)]">
              Lo que preparas por lotes: salsas, carnes guisadas, caldos, pico de gallo… Pon lo que lleva un lote, lo que te cuesta hacerlo y cuánto rinde, y tendrás su coste por kilo. Luego úsala en los escandallos como un ingrediente más.
            </p>
          </div>
          <button onClick={() => open(null)} className="p-press shrink-0 self-start rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white sm:self-auto">
            + Nueva elaboración
          </button>
        </div>
      )}

      {form && <Editor form={form} setForm={setForm} data={data} byId={byId} api={api} error={error} setError={setError} saving={saving} setSaving={setSaving} onSaved={onSaved} usedIn={usedIn} />}

      {!form && preps.length > 0 && (
        <ul className="divide-y divide-[var(--p-line)] rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {preps.map((p) => {
            const y = toShown(p.packSize, p.baseUnit);
            return (
              <li key={p.id}>
                <button type="button" onClick={() => open(p)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.025]">
                  <div className="min-w-0">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-[var(--p-muted)]">
                      Rinde {y.qty} {y.shown} · lote {euros(p.packPriceCents)} · {p.prepLines.length} {p.prepLines.length === 1 ? "ingrediente" : "ingredientes"}
                      {p.trackStock && ` · en stock ${toShown(p.stockQty, p.baseUnit).qty} ${toShown(p.stockQty, p.baseUnit).shown}`}
                    </div>
                    {p.allergens.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-1" aria-label={`Alérgenos: ${p.allergens.join(", ")}`}>
                        {p.allergens.map((a) => (
                          <span key={a} title={a}>
                            <AllergenIcon name={a} size={20} />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold">{perUnitText(unitCostCents(p), p.baseUnit)}</span>
                    <span aria-hidden className="text-lg text-[var(--p-faint)]">›</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Editor({
  form,
  setForm,
  data,
  byId,
  api,
  error,
  setError,
  saving,
  setSaving,
  onSaved,
  usedIn,
}: {
  form: Form;
  setForm: (f: Form | null) => void;
  data: Overview;
  byId: Map<string, Ingredient>;
  api: string;
  error: string;
  setError: (e: string) => void;
  saving: boolean;
  setSaving: (b: boolean) => void;
  onSaved: () => Promise<void>;
  usedIn: (id: string) => number;
}) {
  const [portion, setPortion] = useState("130");
  const [batch, setBatch] = useState("");
  const [batchMsg, setBatchMsg] = useState("");
  const base = BASE_OF[form.yieldShown];
  const yieldBase = num(form.yieldQty) * FACTOR[form.yieldShown];
  const choices = data.ingredients.filter((i) => i.id !== form.id).sort((a, b) => Number(a.isPrep) - Number(b.isPrep) || a.name.localeCompare(b.name, "es"));
  const lines = form.lines.map((l) => {
    const ing = byId.get(l.ingredientId);
    return { ...l, ing, q: ing ? toBase(l.qty, l.shown, ing.baseUnit) : 0 };
  });
  const extras = form.extras.map((e) => ({ label: e.label.trim(), cents: Math.round(num(e.euros) * 100) })).filter((e) => e.label && e.cents >= 0);
  const cost = prepCost(lines.flatMap((l) => (l.ing && l.q > 0 ? [{ quantity: l.q, ingredient: l.ing }] : [])), extras, yieldBase > 0 ? yieldBase : 0);
  // La primera línea es la principal (la carne): las demás se enseñan también «por kg» de ella.
  const main = lines[0]?.ing && lines[0].q > 0 && (lines[0].ing.baseUnit === "G" || lines[0].ing.baseUnit === "KG") ? lines[0] : null;
  const mainKg = main ? (main.ing!.baseUnit === "G" ? main.q / 1000 : main.q) : 0;
  const portionBase = num(portion); // g o ml
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const setLine = (i: number, patch: Partial<LineDraft>) => set({ lines: form.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  async function save() {
    setSaving(true);
    setError("");
    try {
      if (lines.some((l) => !l.ing || !(l.q > 0))) throw new Error("Cada línea necesita un ingrediente y una cantidad");
      const body = {
        name: form.name,
        baseUnit: base,
        yieldQty: yieldBase,
        extras,
        notes: form.notes,
        lines: lines.map((l) => ({ ingredientId: l.ingredientId, quantity: l.q })),
      };
      const res = await fetch(form.id ? `${api}/preps/${form.id}` : `${api}/preps`, { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo guardar");
      await onSaved();
      setForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!form.id) return;
    const n = usedIn(form.id);
    if (!(await ask(`¿Borrar la elaboración «${form.name}»? ${n ? `Se quitará de ${n} ${n === 1 ? "escandallo o elaboración" : "escandallos y elaboraciones"} que la llevan.` : "No la usa ningún plato."}`))) return;
    const res = await fetch(`${api}/ingredients/${form.id}`, { method: "DELETE" });
    if (!res.ok) return setError("No se pudo borrar");
    await onSaved();
    setForm(null);
  }

  // «He hecho un lote»: cuánto de lo principal (kg de carne) o cuántas veces la receta.
  const factor = main ? num(batch) / mainKg : num(batch);
  async function produce() {
    if (!form.id || !(factor > 0)) return;
    const made = toShown(yieldBase * factor, base);
    if (!(await ask(`¿Registrar un lote de ${form.name}? Entran ${made.qty} ${made.shown} al stock y salen sus ingredientes.`, { confirm: "Registrar lote" }))) return;
    const res = await fetch(`${api}/preps/${form.id}/produce`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ factor }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setBatchMsg(json.error ?? "No se pudo registrar");
    setBatch("");
    setBatchMsg(`Lote registrado: +${made.qty} ${made.shown} de ${form.name}.${json.untracked ? ` ${json.untracked} ${json.untracked === 1 ? "ingrediente no se ha descontado" : "ingredientes no se han descontado"} porque no controlas su stock (actívalo en Inventario).` : ""}`);
    await onSaved();
  }

  return (
    <div id="costes-form" className="scroll-mt-24 rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
      <h2 className="text-[17px] font-semibold">{form.id ? form.name || "Elaboración" : "Nueva elaboración"}</h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block">
          <span className={label}>Nombre</span>
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Salsa boloñesa, Cochinita pibil, Pico de gallo…" className={input} />
        </label>
        <div>
          <span className={label}>Rinde el lote (ya terminado)</span>
          <div className="flex gap-2">
            <input inputMode="decimal" value={form.yieldQty} onChange={(e) => set({ yieldQty: e.target.value })} placeholder="60" className={`${input} w-28`} />
            <select value={form.yieldShown} onChange={(e) => set({ yieldShown: e.target.value as Shown })} className="rounded-lg border border-[var(--p-line)] px-2 py-2 text-sm">
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="l">l</option>
              <option value="ml">ml</option>
              <option value="ud">raciones / ud</option>
            </select>
          </div>
        </div>
      </div>

      <h3 className="mt-5 text-sm font-semibold">Lo que lleva un lote</h3>
      <p className="text-xs text-[var(--p-muted)]">Pon primero lo principal (la carne): verás cada especia también «por kg» de ella. Puedes usar otra elaboración (un caldo, un sofrito).</p>
      <ul className="mt-2 space-y-2">
        {lines.map((l, i) => {
          const units = l.ing ? SHOWN_FOR[l.ing.baseUnit] : (["kg", "g"] as Shown[]);
          const perKg = main && i > 0 && l.ing && l.q > 0 ? toShown(l.q / mainKg, l.ing.baseUnit) : null;
          return (
            <li key={i} className="rounded-xl border border-[var(--p-line)] p-2">
              <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_auto_6rem_auto]">
                <select
                  value={l.ingredientId}
                  onChange={(e) => {
                    const ing = byId.get(e.target.value);
                    setLine(i, { ingredientId: e.target.value, shown: ing ? SHOWN_FOR[ing.baseUnit][0] : l.shown });
                  }}
                  className="min-w-0 rounded-lg border border-[var(--p-line)] bg-white px-2 py-2 text-sm"
                >
                  <option value="">Ingrediente…</option>
                  {choices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.isPrep ? " · elaboración" : ""}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <input inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} placeholder="0" aria-label="Cantidad" className="w-20 rounded-lg border border-[var(--p-line)] bg-white px-2 py-2 text-sm" />
                  {units.length > 1 ? (
                    <select value={l.shown} onChange={(e) => setLine(i, { shown: e.target.value as Shown })} aria-label="Unidad" className="rounded-lg border border-[var(--p-line)] bg-white px-1 py-2 text-sm">
                      {units.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="w-6 text-xs text-[var(--p-muted)]">{units[0]}</span>
                  )}
                </div>
                <span className="hidden self-center text-right text-sm sm:block">{l.ing && l.q > 0 ? euros(l.q * unitCostCents(l.ing)) : "—"}</span>
                <button type="button" onClick={() => set({ lines: form.lines.filter((_, j) => j !== i) })} aria-label="Quitar línea" className="col-start-2 row-start-1 self-center px-1 text-lg text-[var(--p-faint)] hover:text-red-500 sm:col-start-4">
                  ×
                </button>
              </div>
              {(perKg || (l.ing && l.q > 0)) && (
                <p className="mt-1 text-[11px] text-[var(--p-muted)]">
                  {i === 0 && main ? "Principal" : perKg ? `${perKg.qty} ${perKg.shown} por kg de ${main!.ing!.name.toLowerCase()}` : ""}
                  {l.ing && l.q > 0 && <span className="sm:hidden"> · {euros(l.q * unitCostCents(l.ing))}</span>}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => set({ lines: [...form.lines, { ingredientId: "", qty: "", shown: "g" }] })} className="mt-2 text-sm font-semibold text-[var(--p-brand)]">
        + Añadir ingrediente
      </button>

      <h3 className="mt-5 text-sm font-semibold">Otros costes del lote</h3>
      <p className="text-xs text-[var(--p-muted)]">Mano de obra (horas × lo que cuesta la hora), horno o energía, bolsas y envases, maquila…</p>
      <ul className="mt-2 space-y-2">
        {form.extras.map((e, i) => (
          <li key={i} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
            <input value={e.label} onChange={(ev) => set({ extras: form.extras.map((x, j) => (j === i ? { ...x, label: ev.target.value } : x)) })} placeholder="Concepto" className={input} />
            <span className="flex items-center gap-1">
              <input inputMode="decimal" value={e.euros} onChange={(ev) => set({ extras: form.extras.map((x, j) => (j === i ? { ...x, euros: ev.target.value } : x)) })} placeholder="0,00" aria-label={`Importe de ${e.label || "el coste"}`} className={input} />
              <span className="text-xs text-[var(--p-muted)]">€</span>
            </span>
            <button type="button" onClick={() => set({ extras: form.extras.filter((_, j) => j !== i) })} aria-label="Quitar coste" className="px-1 text-lg text-[var(--p-faint)] hover:text-red-500">
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        {EXTRA_HINTS.filter((h) => !form.extras.some((e) => e.label.toLowerCase().startsWith(h.toLowerCase()))).map((h) => (
          <button key={h} type="button" onClick={() => set({ extras: [...form.extras, { label: h, euros: "" }] })} className="rounded-full bg-black/[0.05] px-3 py-1.5 text-xs font-semibold">
            + {h}
          </button>
        ))}
      </div>

      <label className="mt-5 block">
        <span className={label}>Cómo se hace (opcional)</span>
        <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} placeholder="Tiempos, temperaturas, a 130 °C durante…" className={input} />
      </label>

      {/* El coste, al momento */}
      <div className="mt-5 rounded-xl bg-black/[0.03] p-3 text-sm">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[11px] font-medium text-[var(--p-muted)]">Ingredientes</p>
            <p className="font-semibold tabular-nums">{euros(cost.ingredientsCents)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-[var(--p-muted)]">Otros costes</p>
            <p className="font-semibold tabular-nums">{euros(cost.extrasCents)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-[var(--p-muted)]">Coste del lote</p>
            <p className="font-semibold tabular-nums">{euros(cost.totalCents)}</p>
          </div>
        </div>
        {yieldBase > 0 && (
          <p className="mt-3 text-center">
            Sale a <span className="text-lg font-bold">{perUnitText(cost.perUnitCents, base)}</span>
            {base !== "UNIT" && (
              <span className="mt-1 block text-xs text-[var(--p-muted)]">
                Una ración de{" "}
                <input inputMode="decimal" value={portion} onChange={(e) => setPortion(e.target.value)} aria-label="Gramos de la ración" className="w-14 rounded border border-[var(--p-line)] bg-white px-1 py-0.5 text-center text-xs" /> {base === "G" ? "g" : "ml"} cuesta{" "}
                <span className="font-semibold text-[var(--p-ink)]">{euros(portionBase > 0 ? cost.perUnitCents * portionBase : 0)}</span>
              </span>
            )}
          </p>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={save} disabled={saving} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button onClick={() => setForm(null)} className="rounded-full px-4 py-2 text-sm text-[var(--p-muted)] hover:bg-black/[0.04]">Cancelar</button>
        {form.id && (
          <button onClick={remove} className="ml-auto whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
            Borrar elaboración
          </button>
        )}
      </div>

      {/* Producción: solo con la elaboración ya guardada */}
      {form.id && (
        <div className="mt-6 border-t border-[var(--p-line)] pt-4">
          <h3 className="text-sm font-semibold">He hecho un lote</h3>
          <p className="text-xs text-[var(--p-muted)]">Entra al stock lo que rinde y salen sus ingredientes (los que controlas en Inventario).</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input inputMode="decimal" value={batch} onChange={(e) => setBatch(e.target.value)} placeholder={main ? fmt(mainKg) : "1"} aria-label="Cantidad del lote" className="w-24 rounded-lg border border-[var(--p-line)] px-3 py-2 text-sm outline-none focus:border-[var(--p-brand)]" />
            <span className="text-sm text-[var(--p-muted)]">{main ? `kg de ${main.ing!.name.toLowerCase()}` : "veces la receta"}</span>
            {factor > 0 && yieldBase > 0 && (
              <span className="text-sm">
                → salen <span className="font-semibold">{toShown(yieldBase * factor, base).qty} {toShown(yieldBase * factor, base).shown}</span>
              </span>
            )}
            <button onClick={produce} disabled={!(factor > 0)} className="p-press rounded-full bg-[var(--p-ink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              Registrar lote
            </button>
          </div>
          {batchMsg && <p className="mt-2 text-sm text-emerald-700">{batchMsg}</p>}
        </div>
      )}
    </div>
  );
}
