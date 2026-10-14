"use client";

import { useEffect, useState } from "react";

// Cifra que "cuenta" hasta su valor al aparecer (ease-out expo, ~1 s).
// Con "reducir movimiento" activado muestra el valor final directamente.
export default function CountUp({ value, format = "number" }: { value: number; format?: "number" | "euros" }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    // Sin animación (reducir movimiento o valor 0): salto directo en el siguiente fotograma.
    const duration = reduce || value === 0 ? 0 : 1100;
    let raf = 0;
    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min((now - start) / duration, 1);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setShown(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const text =
    format === "euros"
      ? new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(shown / 100)
      : Math.round(shown).toLocaleString("es-ES");
  return <span className="tabular-nums">{text}</span>;
}
