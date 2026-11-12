// Fondos con color-mix() que también funcionan en Safari antiguos (iPad con
// iPadOS < 16.2), que no lo entienden. Se pone primero `background` con un
// color de reserva y después `backgroundColor` con la mezcla: si el navegador
// no entiende la mezcla, la ignora y se queda el de reserva.
// Ver docs/USABILIDAD.md («Safari de iPad antiguos»).
import type { CSSProperties } from "react";

export function mixBg(mix: string, fallback: string): CSSProperties {
  return { background: fallback, backgroundColor: mix };
}

// Mezcla de un color con blanco sin color-mix: una capa blanca semitransparente
// encima del color. pct = cuánto color se ve (0–100).
export function tintOverWhite(color: string, pct: number): CSSProperties {
  const white = Math.max(0, Math.min(1, 1 - pct / 100));
  return { backgroundColor: color, backgroundImage: `linear-gradient(rgba(255,255,255,${white}), rgba(255,255,255,${white}))` };
}
