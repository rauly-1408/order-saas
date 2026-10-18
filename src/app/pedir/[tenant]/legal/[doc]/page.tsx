import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import { getTenantTheme, themeToCssVars } from "@/app/lib/tenantConfig";
import { LEGAL_DOCS, readBusiness, type LegalSlug } from "@/app/lib/business";
import { legalText } from "@/app/lib/legalTexts";
import { customPolicySections, readPolicies } from "@/app/lib/storePolicies";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ tenant: string; doc: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { doc } = await params;
  const d = LEGAL_DOCS.find((x) => x.slug === doc);
  return d ? { title: d.title, robots: { index: false } } : {};
}

// Textos legales de la tienda (aviso legal, privacidad, cookies y condiciones),
// generados con Configuración → Información del negocio.
export default async function LegalPage({ params }: Params) {
  const { tenant, doc } = await params;
  const meta = LEGAL_DOCS.find((x) => x.slug === doc);
  if (!meta) notFound();
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { name: true, branding: true, settings: true } });
  if (!t) notFound();
  const theme = getTenantTheme((t.branding as Record<string, unknown>) ?? {});
  const vars = themeToCssVars(theme) as React.CSSProperties;
  const h = await headers();
  const site = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}/pedir/${tenant}`;
  // Configuración → Políticas: si el restaurante escribió su texto, manda ese.
  const custom = readPolicies(t.settings)[doc];
  const sections = custom ? customPolicySections(custom) : legalText(doc as LegalSlug, readBusiness(t.settings), t.name, site);
  const upper = theme.headingCase === "uppercase";

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]" style={{ ...vars, fontFamily: "var(--font-body)" }}>
      <header className="border-b border-[var(--border)] bg-[var(--header-bg)]">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-8">
          <a href={`/pedir/${tenant}`} className="flex items-center gap-2 text-[14px] font-semibold text-[var(--on-header)] no-underline">
            ← {theme.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={theme.logoUrl} alt={t.name} className="h-8 w-auto max-w-[140px] object-contain" />
            ) : (
              t.name
            )}
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <h1 className="text-[40px] text-[var(--heading-color)]" style={{ fontFamily: "var(--font-heading)", textTransform: upper ? "uppercase" : "none", fontWeight: upper ? 400 : 800, lineHeight: 1 }}>
          {meta.title}
        </h1>
        <div className="mt-8 space-y-7">
          {sections.map((s) => (
            <section key={s.heading || "intro"}>
              {s.heading && <h2 className="text-[17px] font-bold">{s.heading}</h2>}
              {s.paragraphs.map((p, i) => (
                <p key={i} className="mt-2 text-[15px] leading-relaxed text-[var(--text-secondary)]">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
        <nav className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--border)] pt-6 text-[13px]" aria-label="Información legal">
          {LEGAL_DOCS.map((d) => (
            <a key={d.slug} href={`/pedir/${tenant}/legal/${d.slug}`} className={`no-underline ${d.slug === doc ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
              {d.title}
            </a>
          ))}
        </nav>
      </main>
    </div>
  );
}
