import { Bean, Droplet, Egg, Fish, Flower2, Leaf, LeafyGreen, Milk, Nut, Shell, Shrimp, Vegan, Wheat, WheatOff, Wine, type LucideIcon } from "lucide-react";
import { allergenName, ui, type Lang } from "@/app/lib/i18n";
import type { DietTag } from "@/app/lib/diet";

// Iconos propios de alérgenos y sellos de dieta: un círculo de color con el
// dibujo en blanco (trazos de Lucide; cacahuete y sésamo dibujados aquí).
// Los nombres de alérgenos son los 14 oficiales (lib/costs.ts → ALLERGENS).

type Glyph = LucideIcon | ((p: { size: number }) => React.ReactElement);

// Cacahuete: dos lóbulos con su cintura.
const Peanut = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9.2 3.5a4.2 4.2 0 0 0-2 7.6c.6.5.7 1.3.3 2a4.2 4.2 0 1 0 6.6 4.6c.5-.6 1.3-.8 2-.4a4.2 4.2 0 1 0-1.9-7.7c-.7.4-1.5.2-2-.4A4.2 4.2 0 0 0 9.2 3.5z" />
    <path d="M9 7.5h.01M15 16.5h.01" />
  </svg>
);

// Sésamo: tres semillas.
const Sesame = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
    <ellipse cx="8" cy="9" rx="2.4" ry="4" transform="rotate(-25 8 9)" />
    <ellipse cx="16" cy="9" rx="2.4" ry="4" transform="rotate(25 16 9)" />
    <ellipse cx="12" cy="16.5" rx="2.4" ry="4" />
  </svg>
);

const ALLERGEN_STYLE: Record<string, { color: string; Icon: Glyph }> = {
  Gluten: { color: "#c27c0e", Icon: Wheat },
  Crustáceos: { color: "#d9480f", Icon: Shrimp },
  Huevos: { color: "#d4a106", Icon: Egg },
  Pescado: { color: "#1c7ed6", Icon: Fish },
  Cacahuetes: { color: "#a0612a", Icon: Peanut },
  Soja: { color: "#5c940d", Icon: Bean },
  Lácteos: { color: "#4263eb", Icon: Milk },
  "Frutos de cáscara": { color: "#7c4a21", Icon: Nut },
  Apio: { color: "#2f9e44", Icon: LeafyGreen },
  Mostaza: { color: "#a68a00", Icon: Droplet },
  Sésamo: { color: "#b5835a", Icon: Sesame },
  Sulfitos: { color: "#862e9c", Icon: Wine },
  Altramuces: { color: "#5f3dc4", Icon: Flower2 },
  Moluscos: { color: "#0b7285", Icon: Shell },
};

const DIET_STYLE: Record<DietTag, { color: string; Icon: Glyph }> = {
  VEGAN: { color: "#2b8a3e", Icon: Vegan },
  VEGETARIAN: { color: "#74b816", Icon: Leaf },
  GLUTEN_FREE: { color: "#e67700", Icon: WheatOff },
};

function Disc({ color, Icon, size, label, decorative }: { color: string; Icon: Glyph; size: number; label: string; decorative?: boolean }) {
  return (
    <span
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label, title: label })}
      className="inline-flex shrink-0 items-center justify-center rounded-full text-white ring-2 ring-white/90"
      style={{ width: size, height: size, backgroundColor: color }}
    >
      <Icon size={Math.round(size * 0.58)} />
    </span>
  );
}

export function AllergenIcon({ name, size = 22, lang = "es", decorative }: { name: string; size?: number; lang?: Lang; decorative?: boolean }) {
  const style = ALLERGEN_STYLE[name];
  if (!style) return null;
  return <Disc {...style} size={size} label={allergenName(name, lang)} decorative={decorative} />;
}

// Fila de alérgenos de la tarjeta: hasta `max` iconos y «+n» si hay más.
export function AllergenRow({ names, lang = "es", max = 7, size = 22 }: { names: string[]; lang?: Lang; max?: number; size?: number }) {
  const known = names.filter((n) => ALLERGEN_STYLE[n]);
  if (!known.length) return null;
  const T = ui(lang);
  const shown = known.slice(0, max);
  return (
    <span className="inline-flex flex-wrap items-center gap-1" aria-label={`${T.allergens}: ${known.map((n) => allergenName(n, lang)).join(", ")}`} role="img">
      {shown.map((n) => (
        <AllergenIcon key={n} name={n} size={size} lang={lang} decorative />
      ))}
      {known.length > shown.length && <span className="text-[11px] font-semibold text-[var(--text-secondary)]">+{known.length - shown.length}</span>}
    </span>
  );
}

export function DietIcon({ tag, size = 26, lang = "es", decorative }: { tag: DietTag; size?: number; lang?: Lang; decorative?: boolean }) {
  const T = ui(lang);
  const label = tag === "VEGAN" ? T.vegan : tag === "VEGETARIAN" ? T.vegetarian : T.glutenFree;
  return <Disc {...DIET_STYLE[tag]} size={size} label={label} decorative={decorative} />;
}

export function dietLabel(tag: DietTag, lang: Lang = "es"): string {
  const T = ui(lang);
  return tag === "VEGAN" ? T.vegan : tag === "VEGETARIAN" ? T.vegetarian : T.glutenFree;
}
