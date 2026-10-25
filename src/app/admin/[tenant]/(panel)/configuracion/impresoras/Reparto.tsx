"use client";

import { Card, ghostBtn, toast } from "../ui";

// «Dónde sale cada cosa»: una fila por categoría de la carta y, en cada una, las
// impresoras de comandas donde sale. Así se ve todo el reparto de un vistazo
// (Bebidas → Barra, Molletes → Cocina) en vez de configurarlo impresora a
// impresora. Se guarda en settings.printing.printers[].categories (null = todo).
// Ver docs/IMPRESION.md

type P = { id: string; name: string; roles: string[]; categories: string[] | null };
type Cat = { id: string; name: string };

const FREE = "LIBRE";
// Palabras que empiezan una palabra del nombre de la categoría («Molletes» no es «tés»).
const DRINKS = /(^|[\s,/(-])(bebid|refresc|cervez|vino|caf[eé]|copa|licor|zumo|agua|drink|c[oó]ctel|infusi|batid|t[eé]s?(?=$|[\s,/)]))/i;
const BAR = /barra|\bbar\b|bebid/i;

export default function Reparto<T extends P>({ printers, categories, onChange }: { printers: T[]; categories: Cat[]; onChange: (printers: T[]) => void }) {
  const kitchen = printers.filter((p) => p.roles.includes("kitchen"));
  const rows: Cat[] = [...categories, { id: FREE, name: "Productos libres" }];
  const all = rows.map((r) => r.id);
  const label = (p: P) => p.name.trim() || `Impresora ${printers.indexOf(p as T) + 1}`;
  const gets = (p: P, id: string) => !p.categories || p.categories.includes(id);

  // Guarda la lista de cada impresora; si lo tiene todo, «todo» (null), y así
  // las categorías que se creen después también le llegan.
  function apply(next: Map<string, Set<string>>) {
    onChange(printers.map((p) => {
      const set = next.get(p.id);
      if (!set) return p;
      return { ...p, categories: all.every((id) => set.has(id)) ? null : all.filter((id) => set.has(id)) };
    }));
  }
  const current = () => new Map(kitchen.map((p) => [p.id, new Set(all.filter((id) => gets(p, id)))]));

  function toggle(p: P, id: string) {
    const next = current();
    const set = next.get(p.id)!;
    if (set.has(id)) {
      if (!kitchen.some((q) => q.id !== p.id && next.get(q.id)!.has(id))) return toast("Cada cosa tiene que salir al menos en una impresora", false);
      set.delete(id);
    } else set.add(id);
    apply(next);
  }

  function suggest() {
    const drinks = categories.filter((c) => DRINKS.test(c.name)).map((c) => c.id);
    if (!drinks.length) return toast("No veo categorías de bebida en la carta. Márcalo a mano abajo.", false);
    const bar = kitchen.find((p) => BAR.test(p.name)) ?? kitchen[1];
    const barIds = new Set([...drinks, FREE]);
    apply(new Map(kitchen.map((p) => [p.id, new Set(p.id === bar.id ? barIds : all.filter((id) => !barIds.has(id)))])));
    toast(`Bebidas y productos libres a «${label(bar)}»; lo demás a ${kitchen.filter((p) => p.id !== bar.id).map((p) => `«${label(p)}»`).join(" y ")}. Revísalo y guarda.`);
  }

  if (kitchen.length < 2) {
    return (
      <Card title="Dónde sale cada cosa" description="Con una sola impresora de comandas, todo sale en ella. Si añades otra (por ejemplo «Barra» para las bebidas), aquí eliges qué sale en cada una." />
    );
  }

  return (
    <Card
      title="Dónde sale cada cosa"
      description="Toca las impresoras en las que sale cada categoría de tu carta. De un menú, cada parte sale en la suya: la bebida en la barra y el mollete en cocina."
      footer={
        <button type="button" onClick={suggest} className={ghostBtn}>
          Repartir solo: bebidas a la barra
        </button>
      }
    >
      <ul className="divide-y divide-[var(--p-line)]">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.name}</p>
              {r.id === FREE && <p className="text-xs text-[var(--p-muted)]">Los que crea el camarero en una mesa (un chupito, una invitación…)</p>}
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={`Dónde sale ${r.name}`}>
              {kitchen.map((p) => {
                const on = gets(p, r.id);
                return (
                  <button key={p.id} type="button" aria-pressed={on} onClick={() => toggle(p, r.id)} className={`p-press min-h-10 rounded-full px-4 py-2 text-sm font-semibold ${on ? "bg-[var(--p-ink)] text-white" : "bg-[var(--p-surface)] text-[var(--p-muted)] ring-1 ring-[var(--p-line)]"}`}>
                    <span className={on ? "" : "invisible"} aria-hidden>
                      ✓{" "}
                    </span>
                    {label(p)}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-[var(--p-muted)]">Las categorías nuevas salen en todas hasta que las repartas: nunca se pierde una comanda.</p>
    </Card>
  );
}
