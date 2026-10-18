"use client";

import { useEffect, useState } from "react";
import { LEGAL_DOCS } from "@/app/lib/business";
import { readPolicies } from "@/app/lib/storePolicies";
import { Card, ghostBtn, input, toast, useSaveBar, useTenantSettings } from "../ui";

// Políticas: ofrecemos un modelo de redacción pensado para hostelería, con tus
// datos del negocio ya puestos. Puedes usarlo tal cual (se actualiza solo si
// cambias tus datos) o editarlo y adaptarlo a tu negocio.
export default function Politicas({ tenant }: { tenant: string }) {
  const { settings, error, save } = useTenantSettings(tenant);
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string> | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/${tenant}/policies`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { templates: {} }))
      .then((d) => setTemplates(d.templates ?? {}))
      .catch(() => {});
  }, [tenant]);

  const current = settings ? (readPolicies(settings) as Record<string, string>) : {};
  const values = edits ?? current;
  const clean = (o: Record<string, string>) => JSON.stringify(Object.fromEntries(Object.entries(o).filter(([, v]) => v?.trim())));
  useSaveBar("politicas", {
    dirty: !!edits && clean(edits) !== clean(current),
    discard: () => setEdits(null),
    save: async () => {
      try {
        await save({ policies: values });
        setEdits(null);
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo guardar", false);
        return false;
      }
    },
  });
  if (!settings) return <p className="text-sm text-[var(--p-muted)]">{error || "Cargando…"}</p>;

  const setText = (slug: string, text: string) => setEdits({ ...values, [slug]: text });

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--p-muted)]">
        Te damos un <b>modelo de redacción para restaurantes</b> con tus datos ya puestos. Úsalo tal cual o ábrelo y adáptalo a tu negocio (horarios de entrega, devoluciones, alcohol…). Antes de abrir al público, que lo revise tu asesor.
      </p>
      {LEGAL_DOCS.map((d) => {
        const custom = !!values[d.slug]?.trim();
        const editing = open === d.slug;
        return (
          <Card
            key={d.slug}
            title={d.title}
            description={custom ? "✏️ Usa tu texto adaptado." : "Usa el modelo automático (se actualiza solo si cambias tus datos del negocio)."}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setOpen(editing ? null : d.slug)}
                  className={ghostBtn}
                >
                  {editing ? "Cerrar" : custom ? "Editar mi texto" : "Adaptar el modelo"}
                </button>
                <a href={`/pedir/${tenant}/legal/${d.slug}`} target="_blank" rel="noopener noreferrer" className={ghostBtn}>
                  Ver página
                </a>
              </>
            }
          >
            {editing && (
              <div>
                <textarea
                  // Sin texto propio se muestra el modelo: solo cuenta como cambio al escribir.
                  value={custom ? values[d.slug] : templates[d.slug] ?? ""}
                  onChange={(e) => setText(d.slug, e.target.value)}
                  rows={16}
                  className={`${input} !mt-0 text-[13px] leading-relaxed`}
                  aria-label={`Texto: ${d.title}`}
                />
                <p className="mt-1 text-[11px] text-[var(--p-muted)]">«## Título» crea un apartado. Deja una línea en blanco entre párrafos.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {templates[d.slug] && (
                    <button type="button" onClick={() => confirm("¿Volver al modelo? Se pierden tus cambios en este texto.") && setText(d.slug, templates[d.slug])} className={`${ghostBtn} text-xs`}>
                      Volver al modelo
                    </button>
                  )}
                  {custom && (
                    <button
                      type="button"
                      onClick={() => {
                        setText(d.slug, "");
                        setOpen(null);
                      }}
                      className={`${ghostBtn} text-xs`}
                    >
                      Usar el texto automático
                    </button>
                  )}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
