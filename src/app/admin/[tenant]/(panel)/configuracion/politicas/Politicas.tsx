"use client";

import { useState } from "react";
import { LEGAL_DOCS } from "@/app/lib/business";
import { readPolicies } from "@/app/lib/storePolicies";
import { Card, Msg, ghostBtn, input, primaryBtn, useTenantSettings } from "../ui";

// Políticas: por defecto se generan con tus datos del negocio. Puedes escribir
// tu propio texto (por ejemplo, el que te dé tu asesor) y sustituye al generado.
export default function Politicas({ tenant }: { tenant: string }) {
  const { settings, error, save } = useTenantSettings(tenant);
  const [edits, setEdits] = useState<Record<string, string> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!settings) return <p className="text-sm text-[var(--p-muted)]">{error || "Cargando…"}</p>;
  const current = readPolicies(settings);
  const values = edits ?? (current as Record<string, string>);

  async function onSave() {
    setBusy(true);
    setMsg(null);
    try {
      await save({ policies: values });
      setEdits(null);
      setMsg({ ok: true, text: "Guardado." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo guardar" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {LEGAL_DOCS.map((d) => {
        const custom = !!values[d.slug]?.trim();
        return (
          <Card
            key={d.slug}
            title={d.title}
            description={custom ? "Usa tu texto propio." : "Se genera solo con tus datos del negocio."}
            footer={
              <>
                <a href={`/pedir/${tenant}/legal/${d.slug}`} target="_blank" rel="noopener noreferrer" className={ghostBtn}>
                  Ver página
                </a>
                <button type="button" onClick={() => setOpen(open === d.slug ? null : d.slug)} className={ghostBtn}>
                  {open === d.slug ? "Cerrar" : custom ? "Editar mi texto" : "Escribir mi propio texto"}
                </button>
              </>
            }
          >
            {open === d.slug && (
              <div>
                <textarea
                  value={values[d.slug] ?? ""}
                  onChange={(e) => setEdits({ ...values, [d.slug]: e.target.value })}
                  rows={10}
                  placeholder={"Escribe aquí tu texto. Deja una línea en blanco entre párrafos y usa «## Título» para un apartado.\nSi lo dejas vacío, se usa el texto generado."}
                  className={`${input} font-mono text-[13px]`}
                  aria-label={`Texto propio: ${d.title}`}
                />
              </div>
            )}
          </Card>
        );
      })}
      <p className="text-xs text-[var(--p-muted)]">Los textos generados son una plantilla orientativa. Antes de abrir al público, pide a un asesor que los revise.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onSave} disabled={busy || !edits} className={primaryBtn}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
        <Msg msg={msg} />
      </div>
    </div>
  );
}
