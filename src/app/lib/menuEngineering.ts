// Ingeniería de menús (método Kasavana-Smith): cruza lo que se vende de cada
// plato con lo que deja, para saber qué hacer con él.
//   · Popular: vende al menos el 70 % de lo que le tocaría si todos vendieran igual.
//   · Rentable: deja por unidad al menos la media ponderada por ventas del grupo.
// Funciones puras para poder probarlas. Ver docs/MODULO-COSTES.md

export type Quadrant = "star" | "plowhorse" | "puzzle" | "dog";
export type MenuItem = { id: string; units: number; profitCents: number };
export type Classified<T extends MenuItem> = T & { quadrant: Quadrant };

export const QUADRANTS: Record<Quadrant, { name: string; advice: string }> = {
  star: { name: "Estrellas", advice: "Se venden mucho y dejan mucho. No los toques: que se vean bien (foto y destacados)." },
  plowhorse: { name: "Caballos de tiro", advice: "Se venden mucho pero dejan poco. Sube un poco el precio o abarata la receta sin que se note." },
  puzzle: { name: "Enigmas", advice: "Dejan mucho pero se piden poco. Dales visibilidad: foto, destacado, que el camarero los recomiende." },
  dog: { name: "Perros", advice: "Ni se venden ni dejan. Quítalos de la carta o cámbialos por algo nuevo." },
};

export function classifyMenu<T extends MenuItem>(items: T[]): { items: Classified<T>[]; popularityLine: number; profitLine: number } {
  const n = items.length;
  const totalUnits = items.reduce((a, i) => a + Math.max(0, i.units), 0);
  const popularityLine = n ? (0.7 * totalUnits) / n : 0;
  // Media ponderada por ventas; sin ventas, la media simple.
  const profitLine = totalUnits > 0 ? items.reduce((a, i) => a + Math.max(0, i.units) * i.profitCents, 0) / totalUnits : n ? items.reduce((a, i) => a + i.profitCents, 0) / n : 0;
  return {
    popularityLine,
    profitLine,
    items: items.map((i) => {
      const popular = totalUnits > 0 && i.units >= popularityLine;
      const profitable = i.profitCents >= profitLine;
      return { ...i, quadrant: popular ? (profitable ? "star" : "plowhorse") : profitable ? "puzzle" : "dog" };
    }),
  };
}
