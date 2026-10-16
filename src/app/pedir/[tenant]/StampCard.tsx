"use client";

// Tarjeta de sellos con la paleta de la marca: fondo del color principal,
// sellos conseguidos en el color secundario y el regalo al final.
// Usa las CSS vars del theme del tenant.

type Props = {
  ordersRequired: number; // el premio llega en el pedido nº N
  stamps: number | null; // sellos que tendrá con este pedido (null = carta, sin teléfono)
  rewardName: string;
  rewardReady?: boolean; // este pedido tiene premio
  note?: string | null;
  upperHeadings?: boolean; // la marca usa títulos en mayúsculas (fuente de rótulo)
};

export default function StampCard({ ordersRequired, stamps, rewardName, rewardReady = false, note, upperHeadings = false }: Props) {
  const needed = Math.max(ordersRequired - 1, 1);
  const filled = rewardReady ? needed : Math.min(stamps ?? 0, needed);
  const title = rewardReady
    ? "¡Este pedido tiene premio!"
    : stamps == null
      ? `Tarjeta de sellos: ${rewardName.toLowerCase()}`
      : filled >= needed
        ? "¡Tarjeta completa!"
        : `Con este pedido llevas ${filled} de ${needed}`;
  const subtitle = rewardReady
    ? rewardName
    : stamps == null
      ? `En tu ${ordersRequired}.º pedido. Cada pedido suma un sello con tu teléfono, sin registrarte.`
      : filled >= needed
        ? `En tu próximo pedido: ${rewardName.toLowerCase()}`
        : `En tu ${ordersRequired}.º pedido: ${rewardName.toLowerCase()}`;

  return (
    <div
      className="overflow-hidden rounded-2xl p-4"
      style={{ backgroundColor: rewardReady ? "var(--brand-secondary)" : "var(--brand-accent)", color: rewardReady ? "var(--on-secondary)" : "var(--on-accent)" }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] opacity-75">Tarjeta de sellos</p>
      <p className="mt-0.5 text-[20px] leading-tight" style={{ fontFamily: "var(--font-heading)", textTransform: upperHeadings ? "uppercase" : "none", fontWeight: upperHeadings ? 400 : 700 }}>
        {title}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label={`${filled} de ${needed} sellos`}>
        {Array.from({ length: needed }, (_, i) => {
          const on = i < filled;
          const fresh = stamps != null && !rewardReady && i === filled - 1; // el sello de este pedido
          return (
            <span
              key={i}
              aria-hidden
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-bold ${fresh ? "animate-pulse" : ""}`}
              style={
                on
                  ? { backgroundColor: rewardReady ? "var(--on-secondary)" : "var(--brand-secondary)", color: rewardReady ? "var(--brand-secondary)" : "var(--on-secondary)" }
                  : { border: "2px dashed currentColor", opacity: 0.45 }
              }
            >
              {on ? "✓" : i + 1}
            </span>
          );
        })}
        <span
          aria-hidden
          className="flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] font-bold"
          style={{ backgroundColor: "var(--bg-base)", color: "var(--brand-secondary)" }}
        >
          🎁 {ordersRequired}.º
        </span>
      </div>
      <p className="mt-3 text-[13px] opacity-90">{subtitle}</p>
      {note && <p className="mt-1 text-[13px] font-semibold">{note}</p>}
    </div>
  );
}
