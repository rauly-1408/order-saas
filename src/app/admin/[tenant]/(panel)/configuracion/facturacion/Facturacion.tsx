"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ask } from "@/app/lib/dialog";
import { Card, Toggle, ghostBtn, input, primaryBtn, toast, useSaveBar } from "../ui";

// Configuración → Facturación · VeriFactu: activar las facturas simplificadas
// encadenadas, elegir entorno, subir el certificado para enviarlas a la AEAT y
// consultar el registro.
// Ver docs/VERIFACTU.md

type Cfg = { enabled: boolean; mode: "VERIFACTU" | "NO_VERIFACTU"; environment: "PRUEBAS" | "PRODUCCION"; seriesPrefix: string };
type Row = { id: string; numSerie: string; invoiceType: string; issueDate: string; totalCents: number; taxCents: number; aeatStatus: string; aeatResponse: { description?: string | null; code?: string | null } | null; hash: string; qrUrl: string; order: { orderNumber: number | null } };
type Data = Cfg & {
  fiscal: { nif: string | null; name: string | null; ok: boolean };
  producer: { name: string | null; nif: string | null };
  certificate: { holderName: string | null; holderNif: string | null; notAfter: string | null; uploadedAt: string | null; daysLeft: number | null } | null;
  sending: { lastSentAt: string | null; lastError: string | null; nextSendAt: string | null };
  count: number;
  pending: number;
  rejected: number;
  chain: { ok: boolean; count: number; brokenAt: string | null };
  sees: boolean;
  recent: Row[];
};

const euros = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const STATUS_CLS: Record<string, string> = { ACEPTADO: "bg-emerald-50 text-emerald-700", ACEPTADO_CON_ERRORES: "bg-amber-50 text-amber-800", RECHAZADO: "bg-red-50 text-red-600", PENDIENTE_ENVIO: "bg-[var(--p-bg)] text-[var(--p-muted)]" };
const dateEs = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "");
const timeEs = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
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
        description="Al cobrar, cada pedido tiene su factura con número correlativo y el QR de Hacienda en el ticket. Si se cancela, sale su rectificativa. No se pueden borrar ni cambiar."
      >
        <Toggle checked={cfg.enabled} onChange={(v) => set({ enabled: v })} label="Emitir facturas VeriFactu" hint={data.fiscal.ok ? `Emisor: ${data.fiscal.name} · NIF ${data.fiscal.nif}` : "Completa antes la razón social y el NIF en Información del negocio."} />
        {!data.fiscal.ok && (
          <Link href={`/admin/${tenant}/configuracion/negocio`} className="mt-1 inline-block text-sm font-semibold text-[var(--p-brand)] underline">
            Ir a Información del negocio
          </Link>
        )}
      </Card>

      <Card title="Entorno y numeración" description="Modalidad VERI*FACTU: cada factura se envía a Hacienda al momento y el ticket lleva la leyenda «VERI*FACTU».">
        <div className="grid gap-4 sm:grid-cols-2">
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

      <EnvioHacienda api={api} data={data} onData={setData} />

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
                      <span title={r.aeatResponse?.description ?? undefined} className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[r.aeatStatus] ?? STATUS_CLS.PENDIENTE_ENVIO}`}>
                        {STATUS[r.aeatStatus] ?? r.aeatStatus}
                      </span>
                      {r.aeatStatus !== "ACEPTADO" && r.aeatResponse?.description && <span className="mt-0.5 block max-w-[220px] text-[11px] leading-tight text-[var(--p-muted)]">{r.aeatResponse.description}</span>}
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

// Envío a Hacienda: lo que falta, el certificado digital y el estado de los envíos.
function EnvioHacienda({ api, data, onData }: { api: string; data: Data; onData: (d: Data) => void }) {
  const [busy, setBusy] = useState<"" | "upload" | "send" | "remove">("");
  const [changing, setChanging] = useState(false);
  const [password, setPassword] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const cert = data.certificate;
  const producerOk = Boolean(data.producer.name && data.producer.nif);
  const daysLeft = cert?.daysLeft ?? null;

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast("Elige el archivo del certificado (.p12 o .pfx)", false);
    setBusy("upload");
    const body = new FormData();
    body.append("file", file);
    body.append("password", password);
    const res = await fetch(`${api}/certificado`, { method: "POST", body }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy("");
    if (!res?.ok) return toast(json.error ?? "No se pudo subir el certificado", false);
    setPassword("");
    setChanging(false);
    if (fileRef.current) fileRef.current.value = "";
    setFileName("");
    onData(json as Data);
    toast(json.warning ?? "Certificado guardado", !json.warning);
  };

  const remove = async () => {
    if (!(await ask("¿Quitar el certificado digital?", { message: "Las facturas nuevas se quedarán pendientes de envío hasta que subas otro.", confirm: "Quitar", danger: true }))) return;
    setBusy("remove");
    const res = await fetch(`${api}/certificado`, { method: "DELETE" }).catch(() => null);
    setBusy("");
    if (res?.ok) onData((await res.json()) as Data);
    else toast("No se pudo quitar el certificado", false);
  };

  const sendNow = async () => {
    setBusy("send");
    const res = await fetch(`${api}/enviar`, { method: "POST" }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy("");
    if (!res?.ok) return toast(json.error ?? "No se pudo enviar", false);
    onData(json as Data);
    const o = json.outcome as { sent: number; rejected: number; waitUntil: string | null; error: string | null } | undefined;
    if (o?.error) toast(o.error, false);
    else if (o && o.sent > 0) toast(`Enviadas ${o.sent} ${o.sent === 1 ? "factura" : "facturas"}${o.rejected ? ` · ${o.rejected} rechazadas` : ""}`, o.rejected === 0);
    else if (o?.waitUntil) toast(`Hacienda pide esperar: se enviarán solas a las ${new Date(o.waitUntil).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`);
    else toast("No había nada pendiente");
  };

  return (
    <Card title="Envío a Hacienda" description="Cada factura se envía sola al emitirse. Si algo falla, se queda guardada y sale en el siguiente envío.">
      {!(data.fiscal.ok && producerOk) && (
        <ul>
          {!data.fiscal.ok && <Check ok={false}>Falta la razón social y el NIF del restaurante</Check>}
          {!producerOk && <Check ok={false}>Falta la declaración responsable del programa (la firma el fabricante del software, no el restaurante)</Check>}
        </ul>
      )}

      <div className="mt-3 rounded-2xl border border-[var(--p-line)] p-4">
        {cert && !changing ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="font-semibold">Certificado de {cert.holderName}</p>
              <p className="text-[var(--p-muted)]">
                {cert.holderNif ? `NIF ${cert.holderNif} · ` : ""}válido hasta el {dateEs(cert.notAfter)}
              </p>
              {daysLeft !== null && daysLeft < 30 && <p className="mt-1 font-semibold text-amber-800">Caduca en {Math.max(daysLeft, 0)} días: renuévalo y súbelo de nuevo.</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setChanging(true)} className={`${ghostBtn} !py-1.5 text-xs`}>
                Cambiar
              </button>
              <button type="button" onClick={remove} disabled={busy !== ""} className={`${ghostBtn} !py-1.5 text-xs`}>
                Quitar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              Sube el <b>certificado digital</b> del restaurante (archivo <b>.p12</b> o <b>.pfx</b>; suele tenerlo el gestor). La contraseña no se guarda.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Archivo del certificado
                <input ref={fileRef} type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} className="sr-only" />
                <span className={`${input} flex cursor-pointer items-center gap-3`}>
                  <span className="shrink-0 rounded-full bg-[var(--p-bg)] px-3 py-1 text-xs font-semibold">Elegir archivo</span>
                  <span className="truncate text-[var(--p-muted)]">{fileName || "Ninguno elegido"}</span>
                </span>
              </label>
              <label className="text-sm">
                Contraseña del certificado
                <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={upload} disabled={busy !== ""} className={primaryBtn}>
                {busy === "upload" ? "Comprobando…" : "Guardar certificado"}
              </button>
              {cert && (
                <button type="button" onClick={() => setChanging(false)} className={ghostBtn}>
                  Cancelar
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {data.pending > 0 ? (
            <p>
              <b>{data.pending}</b> {data.pending === 1 ? "factura pendiente" : "facturas pendientes"} de envío
            </p>
          ) : data.count > 0 ? (
            <p className="text-emerald-700">✓ Todo enviado</p>
          ) : null}
          {data.rejected > 0 && (
            <p className="font-semibold text-red-600">
              {data.rejected} {data.rejected === 1 ? "factura rechazada" : "facturas rechazadas"} por Hacienda: mira el motivo en el registro de abajo
            </p>
          )}
          {data.sending.lastSentAt && <p className="text-xs text-[var(--p-muted)]">Último envío: {timeEs(data.sending.lastSentAt)}</p>}
          {data.sending.lastError && <p className="text-xs text-red-600">Último intento: {data.sending.lastError}</p>}
        </div>
        {cert && producerOk && data.pending > 0 && (
          <button type="button" onClick={sendNow} disabled={busy !== ""} className={`${ghostBtn} !py-1.5 text-xs`}>
            {busy === "send" ? "Enviando…" : "Enviar ahora"}
          </button>
        )}
      </div>
    </Card>
  );
}
