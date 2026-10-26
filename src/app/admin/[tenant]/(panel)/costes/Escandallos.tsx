"use client";

import { useMemo, useState } from "react";
import { unitCostCents } from "@/app/lib/costs";
import { UNIT_LABEL, euros, linesCost, typicalPlate, type Ingredient, type Overview, type Product, type RecipeLine } from "./types";
import { netOfVat } from "@/app/lib/costs";

type Props = { data: Overview; api: string; onSaved: () => Promise<void>; onGoToIngredients: () => void };

export default function Escandallos({ data, api, onSaved, onGoToIngredients }: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ingredients = useMemo(() => new Map<string, Ingredient>(data.ingredients.map((i) => [i.id, i])), [data.ingredients]);
  const products = data.categories.flatMap((c) => c.products.map((p) => ({ ...p, category: c.name })));
  const selected = products.find((p) => p.id === selectedId) ?? null;
  const filtered = products.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  if (data.ingredients.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 bg-[var(--p-surface)]/60 p-6 text-center">
        <p className="font-semibold">Primero crea tus ingredientes</p>
        <p className="mt-1 text-sm text-[var(--p-muted)]">Un escandallo dice cuánto de cada ingrediente lleva un plato.</p>
        <button onClick={onGoToIngredients} className="mt-4 p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white">
          Ir a ingredientes
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* Selector de plato */}
      <aside className={`rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${selected ? "hidden lg:block" : ""}`}>
        <div className="border-b border-[var(--p-line)] p-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar plato…"
            className="w-full rounded-lg border border-[var(--p-line)] px-3 py-2 text-sm outline-none focus:border-[var(--p-brand)]"
          />
        </div>
        <ul className="max-h-[60vh] divide-y divide-[var(--p-line)] overflow-y-auto">
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setSelectedId(p.id)}
                className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm ${p.id === selectedId ? "bg-[var(--p-bg)] font-semibold" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate">{p.name}</span>
                  <span className="block text-[11px] text-[var(--p-muted)]">{p.category}</span>
                </span>
                <span
                  title={p.recipeLines.length ? "Escandallado" : "Sin escandallo"}
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.recipeLines.length ? "bg-emerald-500" : "bg-[var(--p-line)]"}`}
                />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Editor */}
      <div className={selected ? "" : "hidden lg:block"}>
        {!selected ? (
          <div className="rounded-2xl border border-dashed border-black/10 bg-[var(--p-surface)]/60 p-10 text-center text-sm text-[var(--p-muted)]">
            Elige un plato para escandallarlo.
          </div>
        ) : (
          <ProductRecipes key={selected.id} product={selected} ingredients={ingredients} api={api} onSaved={onSaved} onBack={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  );
}

function ProductRecipes({
  product,
  ingredients,
  api,
  onSaved,
  onBack,
}: {
  product: Product;
  ingredients: Map<string, Ingredient>;
  api: string;
  onSaved: () => Promise<void>;
  onBack: () => void;
}) {
  const [openOption, setOpenOption] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm font-semibold text-[var(--p-brand)] lg:hidden">← Todos los platos</button>
      <RecipeEditor
        title={`${product.name} · receta base`}
        subtitle={`Precio en carta ${euros(product.basePriceCents)}. Lo que lleva siempre, sin contar pan, guarnición ni extras.`}
        initial={product.recipeLines}
        ingredients={ingredients}
        onSave={(lines) => saveRecipe(api, { productId: product.id, lines }, onSaved)}
      />
      <PlateTotal product={product} ingredients={ingredients} />

      {product.modifierGroups.map((g) => (
        <section key={g.group.code} className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h3 className="border-b border-[var(--p-line)] px-4 py-3 text-sm font-bold">{g.group.name}</h3>
          <p className="px-4 pt-2 text-[11px] text-[var(--p-muted)]">
            Estas opciones son comunes a todos los platos que las usan: escandállalas una vez.
          </p>
          <ul className="divide-y divide-[var(--p-line)]">
            {g.group.options.map((o) => {
              const open = openOption === o.id;
              const cost = linesCost(o.recipeLines, ingredients);
              return (
                <li key={o.id} className="px-4 py-2.5">
                  <button onClick={() => setOpenOption(open ? null : o.id)} className="flex w-full items-center justify-between gap-2 text-left text-sm">
                    <span>
                      {o.name}
                      {o.id === g.defaultOptionId && <span className="ml-2 text-[11px] font-semibold text-[var(--p-brand)]">por defecto</span>}
                    </span>
                    <span className={o.recipeLines.length ? "font-semibold" : "text-[var(--p-faint)]"}>
                      {o.recipeLines.length ? euros(cost) : "Sin escandallo"} {open ? "▴" : "▾"}
                    </span>
                  </button>
                  {open && (
                    <div className="mt-3">
                      <RecipeEditor
                        compact
                        initial={o.recipeLines}
                        ingredients={ingredients}
                        onSave={(lines) => saveRecipe(api, { modifierOptionId: o.id, lines }, onSaved)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

async function saveRecipe(
  api: string,
  body: { productId?: string; modifierOptionId?: string; lines: RecipeLine[] },
  onSaved: () => Promise<void>
): Promise<string | null> {
  const res = await fetch(`${api}/recipes`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    return json.error ?? "No se pudo guardar";
  }
  await onSaved();
  return null;
}

type Draft = { ingredientId: string; quantity: string };

function RecipeEditor({
  title,
  subtitle,
  initial,
  ingredients,
  onSave,
  compact = false,
}: {
  title?: string;
  subtitle?: string;
  initial: RecipeLine[];
  ingredients: Map<string, Ingredient>;
  onSave: (lines: RecipeLine[]) => Promise<string | null>;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState<Draft[]>(initial.map((l) => ({ ingredientId: l.ingredientId, quantity: String(l.quantity) })));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const all = [...ingredients.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));

  const parsed = draft.map((d) => ({ ...d, q: Number(d.quantity.replace(",", ".")) }));
  const total = parsed.reduce((acc, d) => {
    const ing = ingredients.get(d.ingredientId);
    return acc + (ing && d.q > 0 ? d.q * unitCostCents(ing) : 0);
  }, 0);

  async function save() {
    const lines = parsed.filter((d) => d.ingredientId && d.q > 0).map((d) => ({ ingredientId: d.ingredientId, quantity: d.q }));
    if (lines.length !== draft.length) {
      setMessage({ ok: false, text: "Cada línea necesita un ingrediente y una cantidad mayor que 0" });
      return;
    }
    setSaving(true);
    const err = await onSave(lines);
    setSaving(false);
    setMessage(err ? { ok: false, text: err } : { ok: true, text: "Guardado" });
  }

  return (
    <div className={compact ? "rounded-lg bg-[var(--p-bg)] p-3" : "rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-4"}>
      {title && <h3 className="font-bold">{title}</h3>}
      {subtitle && <p className="mt-0.5 mb-3 text-xs text-[var(--p-muted)]">{subtitle}</p>}

      <ul className="space-y-2">
        {draft.map((d, idx) => {
          const ing = ingredients.get(d.ingredientId);
          const q = parsed[idx].q;
          return (
            <li key={idx} className="grid grid-cols-[1fr_90px_auto] items-center gap-2 sm:grid-cols-[1fr_110px_80px_auto]">
              <select
                value={d.ingredientId}
                onChange={(e) => setDraft(draft.map((x, i) => (i === idx ? { ...x, ingredientId: e.target.value } : x)))}
                className="min-w-0 rounded-lg border border-[var(--p-line)] bg-white px-2 py-2 text-sm"
              >
                <option value="">Ingrediente…</option>
                {all.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}{i.isPrep ? " · elaboración" : i.kind === "CONSUMABLE" ? " · consumible" : ""}</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <input
                  inputMode="decimal"
                  value={d.quantity}
                  onChange={(e) => setDraft(draft.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))}
                  className="w-full min-w-0 rounded-lg border border-[var(--p-line)] bg-white px-2 py-2 text-sm"
                  placeholder="0"
                />
                <span className="text-xs text-[var(--p-muted)]">{ing ? UNIT_LABEL[ing.baseUnit] : ""}</span>
              </div>
              <span className="hidden text-right text-sm sm:block">{ing && q > 0 ? euros(q * unitCostCents(ing)) : "—"}</span>
              <button onClick={() => setDraft(draft.filter((_, i) => i !== idx))} aria-label="Quitar línea" className="px-1 text-lg text-[var(--p-faint)] hover:text-red-500">
                ×
              </button>
            </li>
          );
        })}
      </ul>

      <button onClick={() => setDraft([...draft, { ingredientId: "", quantity: "" }])} className="mt-3 text-sm font-semibold text-[var(--p-brand)]">
        + Añadir ingrediente
      </button>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--p-line)] pt-3">
        <span className="text-sm">
          Coste: <span className="font-bold">{euros(total)}</span>
        </span>
        <span className="flex items-center gap-3">
          {message && <span className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</span>}
          <button onClick={save} disabled={saving} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </span>
      </div>
    </div>
  );
}

// El plato tal como sale de cocina: receta base + la opción por defecto de cada
// grupo obligatorio (el pan, la guarnición). El mismo cálculo que Rentabilidad.
function PlateTotal({ product, ingredients }: { product: Product; ingredients: Map<string, Ingredient> }) {
  const plate = typicalPlate(product);
  if (!product.recipeLines.length) return null;
  const groupOf = new Map(product.modifierGroups.flatMap((g) => g.group.options.map((o) => [o.id, g.group.name] as const)));
  const rows = [
    { label: "Receta base", cents: linesCost(product.recipeLines, ingredients), missing: false },
    ...plate.defaults.map((o) => ({ label: `${groupOf.get(o.id) ?? "Opción"}: ${o.name}`, cents: linesCost(o.recipeLines, ingredients), missing: o.recipeLines.length === 0 })),
  ];
  const total = rows.reduce((a, r) => a + r.cents, 0);
  return (
    <section className="rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-bold">Plato completo</h3>
        <span className="text-xl font-bold tabular-nums">{euros(total)}</span>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between gap-3 tabular-nums">
            <span className="min-w-0 text-[var(--p-muted)]">{r.label}</span>
            <span className={r.missing ? "text-amber-700" : ""}>{r.missing ? "sin escandallo" : euros(r.cents)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-[var(--p-line)] pt-2 text-xs text-[var(--p-muted)] tabular-nums">
        Precio en carta {euros(plate.priceCents)} con IVA · {euros(netOfVat(plate.priceCents))} sin IVA
      </p>
    </section>
  );
}
