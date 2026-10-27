// Carta → Opciones: grupos de opciones que el cliente elige al pedir (pan,
// guarnición, extras, salsas…), con sus precios y a qué productos se aplican.
// Validación pura (sin Prisma) para poder probarla. Ver docs/OPCIONES.md

export type OptionInput = { id?: string; name: string; priceDeltaCents: number; isAvailable: boolean };
export type GroupInput = {
  name: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  options: OptionInput[];
  productIds: string[];
};

const MAX_OPTIONS = 60;
const MAX_PRICE = 100_00; // ±100 € por opción

// «Solo una» (maxSelect 1) o «varias» (hasta `max`); obligatorio = hay que elegir al menos una.
export function parseGroup(raw: unknown): GroupInput | string {
  const b = (raw ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
  if (!name) return "Ponle un nombre al grupo (por ejemplo «Elige tu pan»)";
  const rawOptions = Array.isArray(b.options) ? b.options : [];
  if (!rawOptions.length) return "Añade al menos una opción";
  if (rawOptions.length > MAX_OPTIONS) return `Como mucho ${MAX_OPTIONS} opciones por grupo`;
  const options: OptionInput[] = [];
  for (const o of rawOptions) {
    const x = (o ?? {}) as Record<string, unknown>;
    const oname = typeof x.name === "string" ? x.name.trim().slice(0, 60) : "";
    if (!oname) return "Hay una opción sin nombre";
    const price = Number(x.priceDeltaCents ?? 0);
    if (!Number.isInteger(price) || Math.abs(price) > MAX_PRICE) return `Precio no válido en «${oname}»`;
    options.push({ ...(typeof x.id === "string" && x.id && { id: x.id }), name: oname, priceDeltaCents: price, isAvailable: x.isAvailable !== false });
  }
  const names = options.map((o) => o.name.toLowerCase());
  if (new Set(names).size !== names.length) return "Hay dos opciones con el mismo nombre";
  const isRequired = b.isRequired === true;
  const multi = b.multiple === true;
  const max = multi ? Math.min(Math.max(Math.round(Number(b.maxSelect) || options.length), 2), options.length) : 1;
  if (multi && options.length < 2) return "Para elegir varias, añade al menos dos opciones";
  const productIds = Array.isArray(b.productIds) ? [...new Set(b.productIds.filter((p): p is string => typeof p === "string"))].slice(0, 500) : [];
  return { name, isRequired, minSelect: isRequired ? 1 : 0, maxSelect: max, options, productIds };
}

// Código interno estable del grupo (único por restaurante): «Elige tu pan» → «elige-tu-pan».
export function groupCode(name: string, taken: Set<string>): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "grupo";
  let code = base;
  for (let i = 2; taken.has(code); i++) code = `${base}-${i}`;
  return code;
}
