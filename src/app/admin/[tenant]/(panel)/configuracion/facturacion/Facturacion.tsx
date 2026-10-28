"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, Toggle, ghostBtn, input, toast, useSaveBar } from "../ui";

// Configuración → Facturación · VeriFactu: activar las facturas simplificadas
// encadenadas, elegir modalidad y entorno, y consultar el registro.
// Ver docs/VERIFACTU.md

type Cfg = { enabled: boolean; mode: "VERIFACTU" | "NO_VERIFACTU"; environment: "PRUEBAS" | "PRODUCCION"; seriesPrefix: string };
type Row = { id: string; numSerie: string; invoiceType: string; issueDate: string; totalCents: number; taxCents: number; aeatStatus: string; hash: string; qrUrl: string; order: { orderNumber: number | null } };
type Data = Cfg & {
  fiscal: { nif: string | null; name: string | null; ok: boolean };
  producer: { name: string | null; nif: string | null };
  certificate: boolean;
  count: number;
  pending: number;
  chain: { ok: boolean; count: number; brokenAt: string | null };
  sees: boolean;
  recent: Row[];
};

const euros = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const STATUS: Record<string, string> = { PENDIENTE_ENVIO: "Pendiente de envío", ACEPTADO: "Aceptada", ACEPTADO_CON_ERRORES: "Aceptada con errores", RECHAZADO: "Rechazada" };
const TYPE: Record<string, string> = { F2: "Simplificada", F1: "Completa", F3: "Completa (sustituye)", R5: "Rectificativa", R1: "Rectificativa" };

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 py-1.5 text-sm">
      <span aria-hidden className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{ok ? "✓" : "!"}</span>
      <span>{children}</span>
    </li>
  );
}

export default function Facturacion({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/verifactu`;
  const [data, setData] = useState<Data | null>(null);
  const [edits, setEdits] = useState<Cfg | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(api, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d && setData(d as Data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [api]);

  const saved: Cfg | null = data && { enabled: data.enabled, mode: data.mode, environment: data.environment, seriesPrefix: data.seriesPrefix };
  const cfg = edits ?? saved;
  useSaveBar("facturacion", {
    dirty: !!edits && JSON.stringify(edits) !== JSON.stringify(saved),
    discard: () => setEdits(null),
    save: async () => {
      const res = await fetch(api, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(json.error ?? "No se pudo guardar", false);
        return false;
      }
      setData(json as Data);
      setEdits(null);
      return true;
    },
  });

  if (!data || !cfg) return <p className="text-sm text-[var(--p-muted)]">Cargando…</p>;
  const set = (p: Partial<Cfg>) => setEdits({ ...cfg, ...p });

  return (
    <div className="space-y-5">
      <Card
        title="Facturas simplificadas con VeriFactu"
        description="Al cobrar un pedido se emite su factura simplificada con número correlativo, huella encadenada con la anterior y el código QR de Hacienda en el ticket. Si un pedido facturado se cancela, se emite su rectificativa. Las facturas no se pueden borrar ni cambiar."
      >
        <Toggle checked={cfg.enabled} onChange={(v) => set({ enabled: v })} label="Emitir facturas VeriFactu" hint={data.fiscal.ok ? `Emisor: ${data.fiscal.name} · NIF ${data.fiscal.nif}` : "Completa antes la razón social y el NIF en Información del negocio."} />
        {!data.fiscal.ok && (
          <Link href={`/admin/${tenant}/configuracion/negocio`} className="mt-1 inline-block text-sm font-semibold text-[var(--p-brand)] underline">
            Ir a Información del negocio
          </Link>
        )}
      </Card>

      <Card title="Modalidad" description="Las dos son legales. Con VERI*FACTU cada factura se envía a Hacienda al momento y no hace falta guardar firmas; es la que recomienda la AEAT y la más sencilla para ti.">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Modalidad">
          {(
            [
              ["VERIFACTU", "VERI*FACTU (recomendada)", "Se envía cada factura a la AEAT. El ticket lleva la leyenda «VERI*FACTU»."],
              ["NO_VERIFACTU", "Sin envío automático", "Se guardan firmadas y solo se entregan si Hacienda las pide."],
            ] as const
          ).map(([k, t, h]) => (
            <button key={k} type="button" role="radio" aria-checked={cfg.mode === k} onClick={() => set({ mode: k })} className={`rounded-2xl border-2 px-4 py-3 text-left ${cfg.mode === k ? "border-[var(--p-ink)] bg-white" : "border-[var(--p-line)]"}`}>
              <span className="block text-sm font-semibold">{t}</span>
              <span className="mt-0.5 block text-xs text-[var(--p-muted)]">{h}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Entorno
            <select value={cfg.environment} onChange={(e) => set({ environment: e.target.value as Cfg["environment"] })} className={input}>
              <option value="PRUEBAS">Pruebas (el QR apunta al entorno de pruebas de la AEAT)</option>
              <option value="PRODUCCION">Producción (facturas reales)</option>
            </select>
          </label>
          <label className="text-sm">
            Letra de la serie
            <input value={cfg.seriesPrefix} onChange={(e) => set({ seriesPrefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) })} className={input} placeholder="T" />
            <span className="mt-1 block text-xs text-[var(--p-muted)]">
              Números: {cfg.seriesPrefix || "T"}
              {new Date().getFullYear()}-000001, -000002… Las rectificativas van en su propia serie (R{new Date().getFullYear()}).
            </span>
          </label>
        </div>
      </Card>

      <Card title="Para enviar a Hacienda" description="La app ya emite, encadena e imprime las facturas. El envío automático a la AEAT se activa cuando esté todo esto.">
        <ul>
          <Check ok={data.fiscal.ok}>Razón social y NIF del restaurante</Check>
          <Check ok={data.certificate}>Certificado digital del restaurante (de la empresa o del autónomo), para firmar los envíos</Check>
          <Check ok={Boolean(data.producer.name && data.producer.nif)}>Declaración responsable del programa (la firma el fabricante del software, no el restaurante)</Check>
        </ul>
        {data.pending > 0 && (
          <p className="mt-2 text-xs text-[var(--p-muted)]">
            {data.pending} {data.pending === 1 ? "factura espera" : "facturas esperan"} para enviarse en cuanto esté el certificado. Se guardan encadenadas y no se pierden.
          </p>
        )}
      </Card>

      <Card
        title="Registro de facturación"
        description={data.sees ? "Las últimas 50 facturas. El registro completo se puede descargar para la gestoría." : "El detalle lo ve quien tiene el permiso «Ve lo recaudado»."}
        footer={
          data.sees && data.count > 0 ? (
            <a href={`${api}/export`} className={`${ghostBtn} !py-1.5 text-xs`}>
              Descargar registro completo (CSV)
            </a>
          ) : undefined
        }
      >
        <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${data.chain.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {data.chain.ok ? `✓ Cadena íntegra · ${data.count} ${data.count === 1 ? "registro" : "registros"}` : `✗ Cadena rota en ${data.chain.brokenAt}`}
        </p>
        {data.sees && data.recent.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--p-muted)]">
                  <th className="py-2 pr-3 font-medium">Número</th>
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 pr-3 font-medium">Pedido</th>
                  <th className="py-2 pr-3 text-right font-medium">Total</th>
                  <th className="py-2 font-medium">Hacienda</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--p-line)]">
                {data.recent.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 font-medium tabular-nums">
                      <a href={r.qrUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" title="Abrir el cotejo en la sede de la AEAT">
                        {r.numSerie}
                      </a>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{r.issueDate}</td>
                    <td className="py-2 pr-3">{TYPE[r.invoiceType] ?? r.invoiceType}</td>
                    <td className="py-2 pr-3 tabular-nums">#{r.order.orderNumber ?? "?"}</td>
                    <td className={`py-2 pr-3 text-right font-semibold tabular-nums ${r.totalCents < 0 ? "text-[var(--p-accent)]" : ""}`}>{euros(r.totalCents)}</td>
                    <td className="py-2">
                      <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">{STATUS[r.aeatStatus] ?? r.aeatStatus}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.count === 0 && <p className="mt-3 text-sm text-[var(--p-muted)]">Todavía no hay facturas. {cfg.enabled ? "Se emiten solas al cobrar." : "Activa VeriFactu arriba para empezar."}</p>}
      </Card>
    </div>
  );
}
