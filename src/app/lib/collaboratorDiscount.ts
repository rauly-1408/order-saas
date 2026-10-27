// Descuento del colaborador para el cliente (puro: lo usan la tienda, la Caja y
// el servidor, que es el que manda). Ver docs/COLABORADORES.md

// Descuento para el cliente que pide con el código de un colaborador (sobre la
// comida, ya quitado el premio de fidelidad).
export function collaboratorDiscountCents(baseCents: number, discountPct: number): number {
  return discountPct > 0 && baseCents > 0 ? Math.round((baseCents * discountPct) / 100) : 0;
}

// Promoción, cupón y descuento del colaborador no se acumulan: gana el que más
// ahorra (a igualdad, la promoción y luego el cupón, como antes).
export function bestDiscount(promoCents: number, couponCents: number, collabCents: number): "promo" | "coupon" | "collab" | null {
  const best = Math.max(promoCents, couponCents, collabCents);
  if (best <= 0) return null;
  if (promoCents === best && promoCents > couponCents) return "promo";
  if (couponCents === best) return "coupon";
  if (promoCents === best) return "promo";
  return "collab";
}
