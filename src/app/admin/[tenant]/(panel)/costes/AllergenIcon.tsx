// Icono redondo por alérgeno (los 14 obligatorios), con los colores del panel:
// verde de marca, rojo de acento y el tono cálido. Se usa en Costes → Ingredientes.

type Tone = "brand" | "accent" | "warm" | "neutral";

const TONE: Record<Tone, { bg: string; fg: string }> = {
  brand: { bg: "var(--p-brand-soft)", fg: "var(--p-brand)" },
  accent: { bg: "var(--p-accent-soft)", fg: "var(--p-accent)" },
  warm: { bg: "var(--p-warm)", fg: "var(--p-brand-strong)" },
  neutral: { bg: "rgba(0,0,0,0.05)", fg: "var(--p-ink)" },
};

// Trazos sencillos en una caja de 24×24 (stroke = currentColor).
const ICONS: Record<string, { tone: Tone; d: string }> = {
  Gluten: { tone: "warm", d: "M12 21V9M12 9c-3 0-4-2-4-4 3 0 4 2 4 4Zm0 0c3 0 4-2 4-4-3 0-4 2-4 4Zm0 5c-3 0-4-2-4-4 3 0 4 2 4 4Zm0 0c3 0 4-2 4-4-3 0-4 2-4 4Z" },
  Crustáceos: { tone: "accent", d: "M12 12a2 2 0 1 0 2 2 4 4 0 1 0-4 4 6 6 0 1 0-6-6 8 8 0 1 0 8-8" },
  Huevos: { tone: "warm", d: "M12 3c3.5 0 6 5 6 10a6 6 0 0 1-12 0c0-5 2.5-10 6-10Z" },
  Pescado: { tone: "brand", d: "M3 12s4-6 10-6 8 6 8 6-2 6-8 6-10-6-10-6ZM21 7l-3 5 3 5M15 11h.01" },
  Cacahuetes: { tone: "warm", d: "M9 4a4 4 0 0 1 3 6.5A4 4 0 0 1 15 14a4 4 0 1 1-4-4A4 4 0 0 1 9 4ZM9 8h.01M14 15h.01" },
  Soja: { tone: "brand", d: "M6 18C6 10 10 6 18 6c0 8-4 12-12 12ZM6 18l8-8" },
  Lácteos: { tone: "neutral", d: "M9 3h6v3l2 3v12H7V9l2-3ZM7 14h10" },
  "Frutos de cáscara": { tone: "warm", d: "M7 10h10a5 5 0 0 1-10 0ZM8 10a4 4 0 0 1 8 0M12 6V3" },
  Apio: { tone: "brand", d: "M9 21V9M15 21V9M12 21v-9M9 9a3 3 0 1 1 6 0" },
  Mostaza: { tone: "warm", d: "M8 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM16 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM11 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" },
  Sésamo: { tone: "neutral", d: "M12 4c4 4 4 12 0 16-4-4-4-12 0-16ZM12 4v16" },
  Sulfitos: { tone: "accent", d: "M8 3h8l-1 7a3 3 0 0 1-6 0L8 3ZM12 13v6M9 21h6" },
  Altramuces: { tone: "brand", d: "M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM12 3v5M12 16v5M3 12h5M16 12h5" },
  Moluscos: { tone: "accent", d: "M4 14c0-6 4-10 8-10s8 4 8 10H4ZM12 4v10M8 6l2 8M16 6l-2 8M4 14l-2 4h20l-2-4" },
};

export default function AllergenIcon({ name, size = 22, className = "" }: { name: string; size?: number; className?: string }) {
  const icon = ICONS[name];
  const tone = TONE[icon?.tone ?? "neutral"];
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${className}`}
      style={{ width: size, height: size, background: tone.bg, color: tone.fg }}
    >
      {icon ? (
        <svg width={size * 0.64} height={size * 0.64} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d={icon.d} />
        </svg>
      ) : (
        <span style={{ fontSize: size * 0.5, fontWeight: 700 }}>{name.charAt(0)}</span>
      )}
    </span>
  );
}
