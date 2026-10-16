"use client";

// "Escoge quién te lo lleva": enlaces a la tienda del restaurante en Glovo,
// Uber Eats o Just Eat (para restaurantes sin repartidores propios).
// Usa las CSS vars del theme del tenant.

export type PartnerLink = { key: string; label: string; url: string };

const COLORS: Record<string, string> = { glovo: "#ffc244", ubereats: "#06c167", justeat: "#ff8000" };

export default function DeliveryPartners({ partners, compact = false }: { partners: PartnerLink[]; compact?: boolean }) {
  return (
    <div className={`grid gap-2 ${partners.length > 1 ? "grid-cols-2 sm:grid-cols-3" : ""}`}>
      {partners.map((p) => (
        <a
          key={p.key}
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`p-press flex items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-0)] font-bold text-[var(--text-primary)] no-underline ${compact ? "px-3 py-2.5 text-[14px]" : "px-4 py-3.5 text-[15px]"}`}
        >
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[p.key] ?? "currentColor" }} />
          {p.label}
          <span aria-hidden className="text-[var(--text-secondary)]">↗</span>
        </a>
      ))}
    </div>
  );
}
