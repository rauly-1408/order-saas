// Combinaciones de mesas para reservas («5 + 6, de 3 a 5 personas») y
// sugerencia de mesa para un grupo. Funciones puras. Ver docs/RESERVAS.md
export type TableCombo = { id: string; tables: string[]; min: number; max: number; priority: number }; // priority 1 = la primera que se ofrece
export type TableLite = { id: string; name: string; seats: number; zone: string };
export type TableOption = { tableIds: string[]; label: string; seats: number; combo: boolean; fits: boolean };

const int = (v: unknown, min: number, max: number, def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

// Limpia lo guardado (o lo que llega del panel): solo mesas del local, 2 o más, sin repetir.
export function readCombos(raw: unknown, validIds?: Set<string>): TableCombo[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>(); // la misma combinación (mismas mesas) solo una vez
  return raw.slice(0, 60).flatMap((c, i) => {
    const o = (c ?? {}) as Record<string, unknown>;
    const tables = [...new Set(Array.isArray(o.tables) ? o.tables.filter((t): t is string => typeof t === "string" && (!validIds || validIds.has(t))) : [])].slice(0, 8);
    const key = [...tables].sort().join(",");
    if (tables.length < 2 || seen.has(key)) return [];
    seen.add(key);
    const min = int(o.min, 1, 200, 2);
    const max = Math.max(min, int(o.max, 1, 200, min));
    return [{ id: typeof o.id === "string" && /^[\w-]{1,40}$/.test(o.id) ? o.id : `c${Date.now()}${i}`, tables, min, max, priority: int(o.priority, 1, 3, 2) }];
  });
}

export const optionLabel = (names: string[]) => (names.length === 1 ? `Mesa ${names[0]}` : `Mesas ${names.join(" + ")}`);

// Opciones libres para un grupo, de mejor a peor: la mesa suelta más ajustada,
// luego las combinaciones (por prioridad y plazas), y al final el resto de
// mesas libres (fits: false) por si el restaurante quiere elegir a mano.
export function tableOptions(tables: TableLite[], combos: TableCombo[], guests: number, busy: Set<string>): TableOption[] {
  const byId = new Map(tables.map((t) => [t.id, t]));
  const free = tables.filter((t) => !busy.has(t.id));
  const singles = free.filter((t) => t.seats >= guests).sort((a, b) => a.seats - b.seats || a.name.localeCompare(b.name, "es", { numeric: true }));
  const joined = combos
    .filter((c) => c.min <= guests && guests <= c.max && c.tables.every((id) => byId.has(id) && !busy.has(id)))
    .sort((a, b) => a.priority - b.priority || a.max - b.max)
    .map((c) => {
      const ts = c.tables.map((id) => byId.get(id)!);
      return { tableIds: c.tables, label: optionLabel(ts.map((t) => t.name)), seats: c.max, combo: true, fits: true };
    });
  const rest = free.filter((t) => t.seats < guests).sort((a, b) => b.seats - a.seats);
  return [
    ...singles.map((t) => ({ tableIds: [t.id], label: optionLabel([t.name]), seats: t.seats, combo: false, fits: true })),
    ...joined,
    ...rest.map((t) => ({ tableIds: [t.id], label: optionLabel([t.name]), seats: t.seats, combo: false, fits: false })),
  ];
}
