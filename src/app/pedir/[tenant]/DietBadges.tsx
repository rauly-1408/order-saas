import { ui, type Lang } from "@/app/lib/i18n";
import type { DietTag } from "@/app/lib/diet";

// Sellos redondos de dieta (como en las apps de reparto): verde oscuro con dos
// hojas = vegano; verde claro con una hoja = vegetariano. Con su nombre para
// lectores de pantalla y al pasar el ratón.
const STYLE: Record<DietTag, { bg: string; leaves: 1 | 2 }> = {
  VEGAN: { bg: "#1f5c36", leaves: 2 },
  VEGETARIAN: { bg: "#6fa83a", leaves: 1 },
};

// decorative: junto a un texto que ya dice «Vegano», el sello no se lee dos veces.
export default function DietBadges({ tags, size = 26, lang = "es", className = "", decorative = false }: { tags: readonly DietTag[]; size?: number; lang?: Lang; className?: string; decorative?: boolean }) {
  const T = ui(lang);
  if (!tags.length) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {tags.map((tag) => {
        const label = tag === "VEGAN" ? T.vegan : T.vegetarian;
        const { bg, leaves } = STYLE[tag];
        return (
          <svg key={tag} width={size} height={size} viewBox="0 0 32 32" {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label })} className="shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
            {!decorative && <title>{label}</title>}
            <circle cx="16" cy="16" r="15" fill={bg} stroke="#fff" strokeWidth="2" />
            {leaves === 2 ? (
              <g fill="#fff">
                <path d="M15 24c-.4-4.6-2.6-8.4-7-10.2 0 5 2.6 8.8 7 10.2z" />
                <path d="M17 24c.4-5.8 3.2-10.5 8.4-12.8.3 6.3-3 11-8.4 12.8z" />
              </g>
            ) : (
              <g fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 10l6 13 6-13" />
                <path d="M19 9c1.6-1.4 3.6-1.8 5-1.4-.3 1.8-1.7 3.2-3.6 3.6" />
              </g>
            )}
          </svg>
        );
      })}
    </span>
  );
}
