// Sellos de dieta de cada producto (Vegano, Vegetariano, Sin gluten): se marcan en Carta y
// salen como sellos redondos en la tienda, como en las apps de reparto.
export const DIET_TAGS = ["VEGAN", "VEGETARIAN", "GLUTEN_FREE"] as const;
export type DietTag = (typeof DIET_TAGS)[number];

// Solo los sellos conocidos, sin repetir y en orden fijo.
export function parseDietTags(raw: unknown): DietTag[] {
  if (!Array.isArray(raw)) return [];
  return DIET_TAGS.filter((t) => raw.includes(t));
}
