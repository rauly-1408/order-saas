"use client";

import { ask } from "@/app/lib/dialog";
import { useMemo, useState } from "react";
import { unitCostCents } from "@/app/lib/costs";
import { dishVerdict, withPrepMarkup, type CostSettings, type DishVerdict, type PriceMode } from "@/app/lib/pricing";
import { toast, useSaveBar } from "../configuracion/ui";
import GastosFijos from "./GastosFijos";
import MenuMatrix from "./MenuMatrix";
import { UNIT_LABEL, euros, linesCost, type Ingredient, type Overview, type Product, type RecipeLine } from "./types";

// Rentabilidad: lo más importante del negocio, explicado para cualquiera.
// 1) Tu objetivo (cada restaurante a su manera: recargo, food cost o margen).
// 2) Cada plato: lo que cuesta, a cuánto lo vendes, lo que te queda y si llega.
// 3) Al tocar un plato, de dónde sale el coste y cómo se calcula lo que te queda.
// Ver docs/MODULO-COSTES.md

type Props = { data: Overview; api: string; onSaved: () => Promise<void>; onGoToRecipes: () => void };
type Filter = "all" | "below" | "ok" | "missing";
// Para no hacer scroll sin fin: se enseñan unos pocos y el resto con «Ver todos».
const DISHES_FIRST = 10;
const ORDERS_FIRST = 5;

const MODES: { key: PriceMode; label: string; hint: string }[] = [
  { key: "MARKUP", label: "Recargo sobre el coste", hint: "Al coste le sumas un %: me cuesta 3 €, le pongo un 60 % y lo vendo a 4,80 €." },
  { key: "FOOD_COST", label: "Food cost", hint: "El coste es como mucho un % del precio sin IVA: lo habitual en hostelería es 25-35 %." },
  { key: "MARGIN", label: "Margen", hint: "Lo que te queda (precio sin IVA menos el coste) es al menos un % del precio." },
];

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)} %`);
const qtyText = (q: number, unit: Ingredient["baseUnit"]) => {
  const n = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 2 });
  if (unit === "G" && q >= 1000) return `${n(q / 1000)} kg`;
  if (unit === "ML" && q >= 1000) return `${n(q / 1000)} l`;
  return `${n(q)} ${UNIT_LABEL[unit]}`;
};

// El número que se enseña de cada plato, en el idioma del objetivo.
function metric(v: DishVerdict, s: CostSettings): { label: string; value: string } {
  if (s.priceMode === "MARKUP") return { label: "Recargo", value: pct(v.markupPct) };
  if (s.priceMode === "MARGIN") return { label: "Margen", value: pct(v.marginPct) };
  return { label: "Food cost", value: pct(v.foodCostPct) };
}
function goalText(s: CostSettings): string {
  if (s.priceMode === "MARKUP") return `recargo del ${s.markupPct} %`;
  if (s.priceMode === "MARGIN") return `margen del ${s.targetMarginPct} %`;
  return `food cost del ${s.targetFoodCostPct} %`;
}

// El plato tal como sale de cocina: receta + la opción por defecto de cada grupo obligatorio.
type Part = { title: string; lines: RecipeLine[]; priceDeltaCents: number; missing: boolean };
function plateParts(p: Product): Part[] {
  const parts: Part[] = [{ title: "Receta", lines: p.recipeLines, priceDeltaCents: 0, missing: p.recipeLines.length === 0 }];
  for (const g of p.modifierGroups) {
    if (!g.group.isRequired) continue;
    const o = g.group.options.find((x) => x.id === g.defaultOptionId) ?? g.group.options[0];
    if (o) parts.push({ title: `${g.group.name}: ${o.name}`, lines: o.recipeLines, priceDeltaCents: o.priceDeltaCents, missing: o.recipeLines.length === 0 });
  }
  return parts;
}

export default function Rentabilidad({ data, api, onSaved, onGoToRecipes }: Props) {
  // Objetivo y gastos fijos: se prueban en vivo y se guardan con la barra «Cambios sin guardar».
  const [form, setForm] = useState<CostSettings>(data.costSettings);
  const saved = JSON.stringify(data.costSettings);
  useSaveBar("costes-precios", {
    dirty: JSON.stringify(form) !== saved,
    discard: () => setForm(JSON.parse(saved) as CostSettings),
    save: async () => {
      const res = await fetch(`${api}/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) {
        toast("No se pudo guardar", false);
        return false;
      }
      setForm(((await res.json()) as { costs: CostSettings }).costs);
      await onSaved();
      return true;
    },
  });
  const set = (patch: Partial<CostSettings>) => setForm((f) => ({ ...f, ...patch }));
  const hasPreps = data.ingredients.some((i) => i.isPrep);

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [allDishes, setAllDishes] = useState(false);
  const [allOrders, setAllOrders] = useState(false);
  // El objetivo se fija una vez: plegado se lee en una línea y se abre para cambiarlo.
  const [goalOpen, setGoalOpen] = useState(false);
  const pickFilter = (f: Filter) => {
    setFilter(f);
    setAllDishes(false);
  };

  // Las elaboraciones le cuestan al local lo del obrador más su recargo.
  const ingredients = useMemo(() => new Map<string, Ingredient>(withPrepMarkup(data.ingredients, form.prepMarkupPct).map((i) => [i.id, i])), [data.ingredients, form.prepMarkupPct]);

  const dishes = useMemo(
    () =>
      data.categories.flatMap((c) =>
        c.products.map((p) => {
          const parts = plateParts(p);
          const cost = parts.reduce((a, x) => a + linesCost(x.lines, ingredients), 0);
          const price = p.basePriceCents + parts.reduce((a, x) => a + x.priceDeltaCents, 0);
          const noRecipe = parts[0].missing;
          return { p, category: c.name, parts, cost, price, noRecipe, partial: !noRecipe && parts.some((x) => x.missing), v: dishVerdict(cost, price, form) };
        })
      ),
    [data.categories, ingredients, form]
  );

  const costed = dishes.filter((d) => !d.noRecipe);
  const reaching = costed.filter((d) => d.v.meets);
  const below = costed.filter((d) => d.v.meets === false);
  const avgProfit = costed.length ? costed.reduce((a, d) => a + d.v.profitCents, 0) / costed.length : null;
  const q = query.trim().toLowerCase();
  // Primero los que no llegan (los que menos dejan arriba); al final, los que no tienen escandallo.
  const shown = dishes
    .filter((d) => (filter === "below" ? d.v.meets === false : filter === "ok" ? d.v.meets === true : filter === "missing" ? d.noRecipe : true))
    .filter((d) => !q || d.p.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q))
    .sort((a, b) => Number(a.noRecipe) - Number(b.noRecipe) || Number(a.v.meets ?? 2) - Number(b.v.meets ?? 2) || a.v.profitCents / (a.price || 1) - b.v.profitCents / (b.price || 1));

  const listed = allDishes || q ? shown : shown.slice(0, DISHES_FIRST);
  const orders = allOrders ? data.orders : data.orders.slice(0, ORDERS_FIRST);

  async function applyPrice(d: (typeof dishes)[number]) {
    const newBase = d.v.targetPriceCents - (d.price - d.p.basePriceCents);
    if (!(await ask(`¿Cambiar el precio de ${d.p.name} en la carta de ${euros(d.price)} a ${euros(d.v.targetPriceCents)}?`, { confirm: "Cambiar precio" }))) return;
    const res = await fetch(`${api.replace(/\/costs$/, "/products")}/${d.p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ basePriceCents: newBase }) });
    if (!res.ok) return toast("No se pudo cambiar el precio", false);
    toast("Precio cambiado en la carta");
    await onSaved();
  }

  const mode = MODES.find((m) => m.key === form.priceMode)!;
  const example = dishVerdict(300, 0, form).targetPriceCents;

  return (
    <div className="space-y-6">
      {/* 1. Tu objetivo */}
      <section className="rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
        <button type="button" onClick={() => setGoalOpen((o) => !o)} aria-expanded={goalOpen} className="flex w-full items-center gap-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold">Tu objetivo</span>
            {goalOpen ? (
              <span className="block text-xs text-[var(--p-muted)]">Cómo calculas tus precios. Cada negocio lo hace a su manera: elige la tuya y te diremos qué platos llegan.</span>
            ) : (
              <span className="block text-sm text-[var(--p-muted)]">
                Un <span className="font-semibold text-[var(--p-ink)]">{goalText(form)}</span> · lo que cuesta 3,00 € va a {euros(example)}
              </span>
            )}
          </span>
          <span className="shrink-0 rounded-full bg-[var(--p-bg)] px-3 py-1.5 text-xs font-semibold">{goalOpen ? "Cerrar" : "Cambiar"}</span>
        </button>
        {goalOpen && (
        <>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-black/[0.05] p-1 sm:w-fit sm:rounded-full">
          {MODES.map((m) => (
            <button key={m.key} type="button" onClick={() => set({ priceMode: m.key })} className={`p-press rounded-xl px-2 py-1.5 text-[13px] font-medium sm:rounded-full sm:px-3 sm:text-sm ${form.priceMode === m.key ? "bg-[var(--p-surface)] text-[var(--p-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)]"}`}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-[var(--p-muted)]">{mode.hint}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            {form.priceMode === "MARKUP" ? (
              <PctField label="Recargo sobre el coste" value={form.markupPct} max={1000} onChange={(v) => set({ markupPct: v })} />
            ) : form.priceMode === "MARGIN" ? (
              <PctField label="Margen mínimo" value={form.targetMarginPct} min={5} max={95} onChange={(v) => set({ targetMarginPct: v })} />
            ) : (
              <PctField label="Food cost máximo" value={form.targetFoodCostPct} min={5} max={80} onChange={(v) => set({ targetFoodCostPct: v })} />
            )}
            {form.priceMode === "MARKUP" && (
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.markupIncludesVat} onChange={(e) => set({ markupIncludesVat: e.target.checked })} className="h-4 w-4 accent-[var(--p-brand)]" />
                El precio que sale ya lleva el IVA
              </label>
            )}
            <p className="mt-2 rounded-lg bg-[var(--p-bg)] px-3 py-2 text-xs text-[var(--p-muted)]">
              Ejemplo: un plato que te cuesta <span className="font-semibold text-[var(--p-ink)]">3,00 €</span> lo venderías a <span className="font-semibold text-[var(--p-ink)]">{euros(example)}</span> en carta (con IVA).
            </p>
          </div>
          {hasPreps && (
            <div>
              <PctField label="Recargo del obrador en las elaboraciones" value={form.prepMarkupPct} max={300} onChange={(v) => set({ prepMarkupPct: v })} />
              <p className="mt-1 text-xs text-[var(--p-muted)]">{form.prepMarkupPct > 0 ? `Lo que haces por lotes le cuesta al local su coste + ${form.prepMarkupPct} %.` : "Déjalo en 0 si lo haces en el propio local."}</p>
            </div>
          )}
        </div>
        </>
        )}
      </section>

      {/* 2. Resumen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={`Llegan a tu ${goalText(form)}`} value={costed.length ? `${reaching.length} de ${costed.length}` : "—"} tone={costed.length && reaching.length === costed.length ? "ok" : undefined} />
        <Stat label="Te quedan de media por plato" value={avgProfit == null ? "—" : euros(avgProfit)} sub="sin IVA y quitado el coste" />
        <button type="button" onClick={() => {
            pickFilter("missing");
            document.getElementById("tus-platos")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }} className="col-span-2 rounded-2xl bg-[var(--p-surface)] p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:col-span-1">
          <div className="text-sm text-[var(--p-muted)]">Sin escandallo</div>
          <div className={`mt-1 text-2xl font-bold ${dishes.length - costed.length ? "text-amber-700" : ""}`}>{dishes.length - costed.length}</div>
          <div className="text-xs text-[var(--p-muted)]">{dishes.length - costed.length ? "No sabemos lo que te cuestan" : "Todo escandallado"}</div>
        </button>
      </div>

      {/* ¿Qué platos te convienen? (ventas × lo que dejan) */}
      <MenuMatrix
        dishes={costed.map((d) => ({ id: d.p.id, name: d.p.name, category: d.category, profitCents: d.v.profitCents }))}
        missing={dishes.length - costed.length}
        sales={data.sales}
        onPick={(id) => {
          setFilter("all");
          setQuery("");
          setAllDishes(true);
          setOpen(id);
          requestAnimationFrame(() => document.getElementById(`plato-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
        }}
      />

      {/* 3. Platos */}
      <section id="tus-platos" className="scroll-mt-24 rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="px-4 pt-4 sm:px-5">
          <h2 className="text-[17px] font-semibold">Tus platos</h2>
          <p className="text-xs text-[var(--p-muted)]">Tal como salen de cocina, con el pan y la guarnición que van por defecto. Toca uno para ver de dónde sale su coste.</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {(
              [
                ["all", `Todos (${dishes.length})`],
                ["below", `No llegan (${below.length})`],
                ["ok", `Llegan (${reaching.length})`],
                ["missing", `Sin escandallo (${dishes.length - costed.length})`],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" onClick={() => pickFilter(k)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === k ? "bg-[var(--p-ink)] text-white" : "bg-[var(--p-bg)] text-[var(--p-muted)] hover:text-[var(--p-ink)]"}`}>
                {l}
              </button>
            ))}
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar plato…" aria-label="Buscar plato" className="ml-auto w-full rounded-lg border border-[var(--p-line)] px-3 py-1.5 text-sm sm:w-48" />
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="px-5 py-6 text-sm text-[var(--p-muted)]">Ningún plato aquí.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--p-line)] border-t border-[var(--p-line)]">
            {listed.map((d) => {
              const m = metric(d.v, form);
              const isOpen = open === d.p.id;
              return (
                <li key={d.p.id} id={`plato-${d.p.id}`} className="scroll-mt-24">
                  <button type="button" onClick={() => setOpen(isOpen ? null : d.p.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--p-bg)]/60 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{d.p.name}</div>
                      <div className="text-xs text-[var(--p-muted)]">
                        {d.noRecipe ? (
                          <>{d.category} · carta {euros(d.price)}</>
                        ) : (
                          <>
                            Cuesta {euros(d.cost)} · carta {euros(d.price)} · te quedan <span className="font-semibold text-[var(--p-ink)]">{euros(d.v.profitCents)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {d.noRecipe ? (
                      <span className="shrink-0 rounded-full bg-[var(--p-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--p-muted)]">Sin escandallo</span>
                    ) : (
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${d.v.meets ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {m.label} {m.value}
                      </span>
                    )}
                    <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-[var(--p-faint)] transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden>
                      <path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {isOpen && <DishDetail d={d} form={form} ingredients={ingredients} onGoToRecipes={onGoToRecipes} onApply={() => applyPrice(d)} />}
                </li>
              );
            })}
          </ul>
        )}
        {listed.length < shown.length && (
          <button type="button" onClick={() => setAllDishes(true)} className="p-press w-full border-t border-[var(--p-line)] px-4 py-3 text-sm font-semibold text-[var(--p-brand)] hover:bg-[var(--p-bg)]/60">
            Ver los {shown.length - listed.length} platos restantes
          </button>
        )}
        {allDishes && !q && shown.length > DISHES_FIRST && (
          <button
            type="button"
            onClick={() => {
              setAllDishes(false);
              document.getElementById("tus-platos")?.scrollIntoView({ block: "start" });
            }}
            className="p-press w-full border-t border-[var(--p-line)] px-4 py-3 text-sm font-semibold text-[var(--p-muted)] hover:bg-[var(--p-bg)]/60"
          >
            Ver menos
          </button>
        )}
      </section>

      {/* Margen real de pedidos */}
      <section className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <h2 className="px-5 pt-4 pb-1 text-[17px] font-semibold">Lo que te han dejado los últimos pedidos</h2>
        <p className="px-4 pt-2 text-xs text-[var(--p-muted)] sm:px-5">Con lo que pidió cada cliente. Sin IVA ni gastos de envío; quitados ingredientes, packaging y la comisión de la plataforma.</p>
        {data.orders.length === 0 ? (
          <p className="px-5 py-6 text-sm text-[var(--p-muted)]">Todavía no hay pedidos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--p-muted)]">
                  {["Pedido", "Ventas sin IVA", "Ingredientes y packaging", "Comisión", "Te queda"].map((h) => (
                    <th key={h} className="px-4 py-2 font-semibold sm:px-5">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--p-line)]">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2.5 sm:px-5">
                      <span className="font-semibold">#{o.orderNumber}</span> <span className="text-[var(--p-muted)]">{o.customerName}</span>
                      {!o.complete && <div className="text-[11px] text-amber-700">Algún producto sin escandallo: el coste está incompleto</div>}
                    </td>
                    <td className="px-4 py-2.5 sm:px-5">{euros(o.revenueNetCents)}</td>
                    <td className="px-4 py-2.5 sm:px-5">{euros(o.foodCostCents + o.consumablesCents)}</td>
                    <td className="px-4 py-2.5 sm:px-5">{euros(o.platformFeeCents)}</td>
                    <td className="px-4 py-2.5 font-semibold sm:px-5">{euros(o.marginCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.orders.length > ORDERS_FIRST && (
          <button type="button" onClick={() => setAllOrders((a) => !a)} className="p-press w-full border-t border-[var(--p-line)] px-4 py-3 text-sm font-semibold text-[var(--p-brand)] hover:bg-[var(--p-bg)]/60">
            {allOrders ? "Ver menos" : `Ver los ${data.orders.length} pedidos`}
          </button>
        )}
      </section>

      <GastosFijos form={form} set={set} period={data.period} />
    </div>
  );
}

type Dish = { p: Product; parts: Part[]; cost: number; price: number; noRecipe: boolean; partial: boolean; v: DishVerdict };

// Ficha de un plato: de dónde sale el coste y cómo se calcula lo que te queda.
function DishDetail({ d, form, ingredients, onGoToRecipes, onApply }: { d: Dish; form: CostSettings; ingredients: Map<string, Ingredient>; onGoToRecipes: () => void; onApply: () => void }) {
  const row = "flex items-baseline justify-between gap-3 py-1 text-sm";
  return (
    <div className="grid gap-4 bg-[var(--p-bg)]/60 px-4 pt-1 pb-4 sm:px-5 lg:grid-cols-2">
      <div className="min-w-0 rounded-xl bg-[var(--p-surface)] p-3">
        <p className="text-xs font-semibold tracking-wide text-[var(--p-muted)] uppercase">De dónde sale el coste</p>
        {d.parts.map((part) => (
          <div key={part.title} className="mt-2">
            <p className="text-sm font-semibold">{part.title}</p>
            {part.missing ? (
              <p className="text-xs text-amber-700">Sin escandallo: no suma coste</p>
            ) : (
              part.lines.map((l) => {
                const i = ingredients.get(l.ingredientId);
                return (
                  <div key={l.ingredientId} className={`${row} text-[var(--p-muted)]`}>
                    <span className="min-w-0 truncate">
                      {i?.name ?? "Ingrediente borrado"} · {i ? qtyText(l.quantity, i.baseUnit) : ""}
                      {i?.isPrep && form.prepMarkupPct > 0 && ` (obrador +${form.prepMarkupPct} %)`}
                    </span>
                    <span className="shrink-0 tabular-nums">{i ? euros(l.quantity * unitCostCents(i)) : "—"}</span>
                  </div>
                );
              })
            )}
          </div>
        ))}
        <div className={`${row} mt-2 border-t border-[var(--p-line)] pt-2 font-semibold`}>
          <span>Coste del plato</span>
          <span className="tabular-nums">{euros(d.cost)}</span>
        </div>
      </div>

      <div className="min-w-0 rounded-xl bg-[var(--p-surface)] p-3">
        <p className="text-xs font-semibold tracking-wide text-[var(--p-muted)] uppercase">Cuánto te queda</p>
        <div className={`${row} mt-2`}>
          <span>Precio en carta</span>
          <span className="tabular-nums">{euros(d.price)}</span>
        </div>
        <div className={`${row} text-[var(--p-muted)]`}>
          <span>IVA (10 %)</span>
          <span className="tabular-nums">−{euros(d.v.vatCents)}</span>
        </div>
        <div className={`${row} text-[var(--p-muted)]`}>
          <span>Coste del plato</span>
          <span className="tabular-nums">−{euros(d.cost)}</span>
        </div>
        <div className={`${row} border-t border-[var(--p-line)] pt-2 font-semibold`}>
          <span>Te quedan por plato</span>
          <span className="tabular-nums">{euros(d.v.profitCents)}</span>
        </div>
        {!d.noRecipe && (
          <p className="mt-3 text-sm">
            {form.priceMode === "MARKUP" ? (
              <>
                Recargo sobre el coste: <span className="font-semibold">{pct(d.v.markupPct)}</span> (lo vendes a{" "}
                {((form.markupIncludesVat ? d.price : d.v.netCents) / d.cost).toLocaleString("es-ES", { maximumFractionDigits: 2 })} veces lo que cuesta{form.markupIncludesVat ? ", con IVA" : ", sin IVA"}).
              </>
            ) : form.priceMode === "MARGIN" ? (
              <>
                Margen: <span className="font-semibold">{pct(d.v.marginPct)}</span> del precio sin IVA.
              </>
            ) : (
              <>
                Food cost: <span className="font-semibold">{pct(d.v.foodCostPct)}</span> (el coste es ese % del precio sin IVA).
              </>
            )}{" "}
            {d.v.meets ? (
              <span className="text-emerald-700">Llega a tu {goalText(form)}.</span>
            ) : (
              <span className="text-amber-700">
                Tu objetivo es un {goalText(form)}: con este coste, el precio sería {euros(d.v.targetPriceCents)}.
              </span>
            )}
          </p>
        )}
        {d.partial && <p className="mt-2 text-xs text-amber-700">Alguna opción por defecto no tiene escandallo: el coste real es algo mayor.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={onGoToRecipes} className="rounded-full border border-[var(--p-line)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--p-bg)]">
            {d.noRecipe ? "Hacer el escandallo" : "Editar escandallo"}
          </button>
          {!d.noRecipe && !d.v.meets && d.v.targetPriceCents > 0 && (
            <button type="button" onClick={onApply} className="rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--p-muted)] hover:bg-[var(--p-bg)] hover:text-[var(--p-ink)]">
              Poner {euros(d.v.targetPriceCents)} en la carta
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PctField({ label, value, onChange, min = 0, max }: { label: string; value: number; onChange: (v: number) => void; min?: number; max: number }) {
  return (
    <label className="block">
      <span className="text-sm text-[var(--p-muted)]">{label}</span>
      <span className="mt-1 flex items-center gap-2">
        <input type="number" inputMode="decimal" min={min} max={max} value={value} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))} className="w-24 rounded-lg border border-[var(--p-line)] px-2 py-1 text-xl font-bold" />
        <span className="text-xl font-bold">%</span>
      </span>
    </label>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" }) {
  return (
    <div className="rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="text-sm text-[var(--p-muted)]">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone === "ok" ? "text-emerald-700" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-[var(--p-muted)]">{sub}</div>}
    </div>
  );
}
