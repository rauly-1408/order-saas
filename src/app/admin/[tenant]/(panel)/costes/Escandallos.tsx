"use client";

import { useMemo, useState } from "react";
import { unitCostCents } from "@/app/lib/costs";
import { UNIT_LABEL, euros, linesCost, type Ingredient, type Overview, type Product, type RecipeLine } from "./types";

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
      <div className="rounded-xl border border-dashed border-[#e0d1ff] bg-white p-6 text-center">
        <p className="font-semibold">Primero crea tus ingredientes</p>
        <p className="mt-1 text-sm text-[#6b6890]">Un escandallo dice cuánto de cada ingrediente lleva un plato.</p>
        <button onClick={onGoToIngredients} className="mt-4 rounded-lg bg-[#7939fe] px-4 py-2 text-sm font-semibold text-white">
          Ir a ingredientes
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* Selector de plato */}
      <aside className={`rounded-xl border border-[#eaeaf4] bg-white ${selected ? "hidden lg:block" : ""}`}>
        <div className="border-b border-[#eaeaf4] p-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar plato…"
            className="w-full rounded-lg border border-[#eaeaf4] px-3 py-2 text-sm outline-none focus:border-[#7939fe]"
          />
        </div>
        <ul className="max-h-[60vh] divide-y divide-[#eaeaf4] overflow-y-auto">
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setSelectedId(p.id)}
                className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm ${p.id === selectedId ? "bg-[#f7f7fb] font-semibold" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate">{p.name}</span>
                  <span className="block text-[11px] text-[#6b6890]">{p.category}</span>
                </span>
                <span
                  title={p.recipeLines.length ? "Escandallado" : "Sin escandallo"}
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.recipeLines.length ? "bg-emerald-500" : "bg-[#eaeaf4]"}`}
                />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Editor */}
      <div className={selected ? "" : "hidden lg:block"}>
        {!selected ? (
          <div className="rounded-xl border border-dashed border-[#eaeaf4] bg-white p-10 text-center text-sm text-[#6b6890]">
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
      <button onClick={onBack} className="text-sm font-semibold text-[#7939fe] lg:hidden">← Todos los platos</button>
      <RecipeEditor
        title={`${product.name} · receta base`}
        subtitle={`Precio en carta ${euros(product.basePriceCents)}. Lo que lleva siempre, sin contar pan, guarnición ni extras.`}
        initial={product.recipeLines}
        ingredients={ingredients}
        onSave={(lines) => saveRecipe(api, { productId: product.id, lines }, onSaved)}
      />

      {product.modifierGroups.map((g) => (
        <section key={g.group.code} className="rounded-xl border border-[#eaeaf4] bg-white">
          <h3 className="border-b border-[#eaeaf4] px-4 py-3 text-sm font-bold">{g.group.name}</h3>
          <p className="px-4 pt-2 text-[11px] text-[#6b6890]">
            Estas opciones son comunes a todos los platos que las usan: escandállalas una vez.
          </p>
          <ul className="divide-y divide-[#eaeaf4]">
            {g.group.options.map((o) => {
              const open = openOption === o.id;
              const cost = linesCost(o.recipeLines, ingredients);
              return (
                <li key={o.id} className="px-4 py-2.5">
                  <button onClick={() => setOpenOption(open ? null : o.id)} className="flex w-full items-center justify-between gap-2 text-left text-sm">
                    <span>
                      {o.name}
                      {o.id === g.defaultOptionId && <span className="ml-2 text-[11px] font-semibold text-[#7939fe]">por defecto</span>}
                    </span>
                    <span className={o.recipeLines.length ? "font-semibold" : "text-[#b8b6df]"}>
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
    <div className={compact ? "rounded-lg bg-[#f7f7fb] p-3" : "rounded-xl border border-[#eaeaf4] bg-white p-4"}>
      {title && <h3 className="font-bold">{title}</h3>}
      {subtitle && <p className="mt-0.5 mb-3 text-xs text-[#6b6890]">{subtitle}</p>}

      <ul className="space-y-2">
        {draft.map((d, idx) => {
          const ing = ingredients.get(d.ingredientId);
          const q = parsed[idx].q;
          return (
            <li key={idx} className="grid grid-cols-[1fr_90px_auto] items-center gap-2 sm:grid-cols-[1fr_110px_80px_auto]">
              <select
                value={d.ingredientId}
                onChange={(e) => setDraft(draft.map((x, i) => (i === idx ? { ...x, ingredientId: e.target.value } : x)))}
                className="min-w-0 rounded-lg border border-[#eaeaf4] bg-white px-2 py-2 text-sm"
              >
                <option value="">Ingrediente…</option>
                {all.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <input
                  inputMode="decimal"
                  value={d.quantity}
                  onChange={(e) => setDraft(draft.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))}
                  className="w-full min-w-0 rounded-lg border border-[#eaeaf4] bg-white px-2 py-2 text-sm"
                  placeholder="0"
                />
                <span className="text-xs text-[#6b6890]">{ing ? UNIT_LABEL[ing.baseUnit] : ""}</span>
              </div>
              <span className="hidden text-right text-sm sm:block">{ing && q > 0 ? euros(q * unitCostCents(ing)) : "—"}</span>
              <button onClick={() => setDraft(draft.filter((_, i) => i !== idx))} aria-label="Quitar línea" className="px-1 text-lg text-[#b8b6df] hover:text-red-500">
                ×
              </button>
            </li>
          );
        })}
      </ul>

      <button onClick={() => setDraft([...draft, { ingredientId: "", quantity: "" }])} className="mt-3 text-sm font-semibold text-[#7939fe]">
        + Añadir ingrediente
      </button>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#eaeaf4] pt-3">
        <span className="text-sm">
          Coste: <span className="font-bold">{euros(total)}</span>
        </span>
        <span className="flex items-center gap-3">
          {message && <span className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</span>}
          <button onClick={save} disabled={saving} className="rounded-lg bg-[#7939fe] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </span>
      </div>
    </div>
  );
}
