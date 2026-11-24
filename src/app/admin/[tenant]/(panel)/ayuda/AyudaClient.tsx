"use client";

import { useEffect, useMemo, useState } from "react";
import type { ManualSection } from "@/app/lib/manual";
import { openAssistant, SparkIcon } from "../Assistant";
import RichText from "../RichText";
import { useRouter } from "next/navigation";
import { resetTour, TOURS, WELCOME } from "../tourSteps";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Manual por secciones (plegables, como las listas de Shopify) con buscador.
// Un enlace «Ayuda → Caja» llega con #caja y abre esa sección.
export default function AyudaClient({ tenant, manual, canAsk }: { tenant: string; manual: ManualSection[]; canAsk: boolean }) {
  const [q, setQ] = useState("");
  const [openSec, setOpenSec] = useState<string | null>(null);
  const router = useRouter();
  // «Ver el recorrido»: vuelve a enseñar las nubes de esa sección.
  const replay = (slug: string) => {
    if (slug === "panel") {
      resetTour(WELCOME.key);
      return router.push(`/admin/${tenant}/home`);
    }
    const t = TOURS.find((x) => x.manual === slug && x.key !== "ayuda");
    if (!t) return;
    resetTour(t.key);
    router.push(`/admin/${tenant}/${t.path}?recorrido=1`);
  };
  const hasTour = (slug: string) => slug === "panel" || TOURS.some((x) => x.manual === slug && x.key !== "ayuda");

  useEffect(() => {
    const go = () => {
      const h = decodeURIComponent(window.location.hash.slice(1));
      if (!h) return;
      setQ(""); // un enlace a una sección enseña la sección, no la búsqueda
      setOpenSec(h);
      setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, []);

  const found = useMemo(() => {
    const words = norm(q).split(/\s+/).filter((w) => w.length > 2);
    if (!words.length) return null;
    return manual.flatMap((s) => s.entries.filter((e) => words.every((w) => norm(`${s.title} ${e.title} ${e.body}`).includes(w)))).slice(0, 30);
  }, [q, manual]);

  return (
    <div className="mx-auto max-w-3xl text-[var(--p-ink)]">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ayuda</h1>
      <p className="mt-1 text-sm text-[var(--p-muted)]">El manual del panel, sección por sección. Busca lo que quieras hacer o abre una sección.</p>

      <div className="mt-5 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="¿Qué quieres hacer?" aria-label="Buscar en el manual" className="h-12 min-w-0 flex-1 rounded-2xl border border-[var(--p-line)] bg-[var(--p-surface)] px-4 text-[16px] outline-none focus:border-[var(--p-brand)]" />
        {canAsk && (
          <button type="button" onClick={openAssistant} aria-label="Pregúntale a NORA" className="p-press flex h-12 w-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--p-brand)] text-[15px] font-semibold text-white sm:w-auto sm:px-4">
            <SparkIcon className="h-5 w-5" />
            <span className="hidden sm:inline">Pregúntale a NORA</span>
          </button>
        )}
      </div>

      {found ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm text-[var(--p-muted)]">{found.length ? `${found.length} ${found.length === 1 ? "resultado" : "resultados"}` : "No hay nada con esas palabras. Prueba con otras o pregúntale a NORA."}</p>
          {found.map((e) => (
            <article key={e.id} className="rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-[var(--p-line)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--p-muted)]">{e.sectionTitle}</p>
              <h2 className="mt-0.5 text-[16px] font-semibold">{e.title}</h2>
              <RichText text={e.body} tenant={tenant} className="mt-2 space-y-1.5 text-[15px] leading-relaxed" />
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 divide-y divide-[var(--p-line)] overflow-hidden rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-[var(--p-line)]">
          {manual.map((s) => (
            <details
              key={s.slug}
              id={s.slug}
              open={openSec === s.slug}
              onToggle={(ev) => {
                const isOpen = (ev.currentTarget as HTMLDetailsElement).open;
                if (isOpen) setOpenSec(s.slug);
                else if (openSec === s.slug) setOpenSec(null);
              }}
              className="group scroll-mt-20"
            >
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 hover:bg-black/[0.02]">
                <span className="min-w-0 truncate text-[16px] font-semibold">{s.title}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-[var(--p-muted)]">
                  {s.entries.length} {s.entries.length === 1 ? "tema" : "temas"}
                  <span aria-hidden className="text-base transition-transform group-open:rotate-90">›</span>
                </span>
              </summary>
              <div className="border-t border-[var(--p-line)] px-4 pt-3 pb-4">
                {s.intro && <RichText text={s.intro} tenant={tenant} className="mb-3 space-y-1 text-sm text-[var(--p-muted)]" />}
                {hasTour(s.slug) && (
                  <button type="button" onClick={() => replay(s.slug)} className="p-press mb-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--p-brand-soft)] px-4 text-sm font-semibold text-[var(--p-brand)]">
                    <span aria-hidden>▶</span>
                    {s.slug === "panel" ? "Ver la bienvenida otra vez" : "Ver el recorrido"}
                  </button>
                )}
                <div className="space-y-1.5">
                  {s.entries.map((e) => (
                    <details key={e.id} className="group/e rounded-xl bg-[var(--p-bg)]">
                      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-[15px] font-medium">
                        {e.title}
                        <span aria-hidden className="text-[var(--p-muted)] transition-transform group-open/e:rotate-90">›</span>
                      </summary>
                      <RichText text={e.body} tenant={tenant} className="space-y-1.5 px-3 pb-3 text-[15px] leading-relaxed" />
                    </details>
                  ))}
                </div>
              </div>
            </details>
          ))}
          {!manual.length && <p className="p-6 text-center text-sm text-[var(--p-muted)]">El manual no se ha podido cargar. Inténtalo de nuevo en un momento.</p>}
        </div>
      )}
    </div>
  );
}
