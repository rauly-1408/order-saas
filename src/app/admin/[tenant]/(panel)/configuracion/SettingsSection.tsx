import { sectionBySlug } from "./sections";

// Título y explicación de cada apartado, como en Shopify.
export default function SettingsSection({ slug, children }: { slug: string; children: React.ReactNode }) {
  const s = sectionBySlug(slug);
  return (
    <section aria-labelledby={`cfg-${slug}`}>
      <h2 id={`cfg-${slug}`} className="text-[22px] font-semibold tracking-tight">
        {s?.label}
      </h2>
      {s?.description && <p className="mt-1 mb-5 text-sm text-[var(--p-muted)]">{s.description}</p>}
      {children}
    </section>
  );
}
