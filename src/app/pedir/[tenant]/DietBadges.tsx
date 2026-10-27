import type { Lang } from "@/app/lib/i18n";
import type { DietTag } from "@/app/lib/diet";
import { DietIcon } from "./FoodIcons";

// Sellos redondos de dieta (Vegano, Vegetariano, Sin gluten) uno al lado del otro.
// decorative: junto a un texto que ya dice «Vegano», el sello no se lee dos veces.
export default function DietBadges({ tags, size = 26, lang = "es", className = "", decorative = false }: { tags: readonly DietTag[]; size?: number; lang?: Lang; className?: string; decorative?: boolean }) {
  if (!tags.length) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {tags.map((tag) => (
        <DietIcon key={tag} tag={tag} size={size} lang={lang} decorative={decorative} />
      ))}
    </span>
  );
}
