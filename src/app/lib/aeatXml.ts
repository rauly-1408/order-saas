// VeriFactu: mensaje SOAP «RegFactuSistemaFacturacion» con los registros de
// alta y lectura de la respuesta de la AEAT (Orden HAC/1177/2024 y los esquemas
// SuministroLR.xsd / SuministroInformacion.xsd). El orden de los elementos es el
// de los esquemas: la AEAT rechaza el envío si se altera. Ver docs/VERIFACTU.md
import { amount } from "@/app/lib/verifactu";

const NS_LR = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd";
const NS_SI = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd";

export const AEAT_ENDPOINTS = {
  PRUEBAS: "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
  PRODUCCION: "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
} as const;

export const MAX_RECORDS_PER_SEND = 1000; // límite de la AEAT por envío

export type IdFactura = { nif: string; numSerie: string; issueDate: string };

export type AltaRecord = {
  id: IdFactura;
  issuerName: string;
  invoiceType: string; // F1 F2 F3 R1 R5
  rectified: IdFactura | null; // R1/R5
  substituted: IdFactura | null; // F3
  recipient: { nif: string; name: string } | null; // F1/F3/R1
  taxRate: number;
  baseCents: number;
  taxCents: number;
  totalCents: number;
  previous: (IdFactura & { hash: string }) | null; // null = primer registro
  genTimestamp: string;
  hash: string;
};

export type SoftwareInfo = {
  producerName: string;
  producerNif: string;
  name: string; // NombreSistemaInformatico
  id: string; // IdSistemaInformatico (2 caracteres)
  version: string;
  installation: string; // NumeroInstalacion
};

export type SendHeader = { issuerName: string; issuerNif: string; representative: { name: string; nif: string } | null };

export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const el = (name: string, value: string) => `<sum1:${name}>${xmlEscape(value)}</sum1:${name}>`;
const box = (name: string, inner: string) => `<sum1:${name}>${inner}</sum1:${name}>`;
const idFactura = (tag: string, i: IdFactura) => box(tag, el("IDEmisorFactura", i.nif) + el("NumSerieFactura", i.numSerie) + el("FechaExpedicionFactura", i.issueDate));
const cut = (s: string, max: number) => s.trim().replace(/\s+/g, " ").slice(0, max);

export function altaXml(r: AltaRecord, sw: SoftwareInfo): string {
  const parts: string[] = [
    el("IDVersion", "1.0"),
    idFactura("IDFactura", r.id),
    el("NombreRazonEmisor", cut(r.issuerName, 120)),
    el("TipoFactura", r.invoiceType),
  ];
  if (r.invoiceType.startsWith("R")) {
    parts.push(el("TipoRectificativa", "I")); // por diferencias
    if (r.rectified) parts.push(box("FacturasRectificadas", idFactura("IDFacturaRectificada", r.rectified)));
  }
  if (r.substituted) parts.push(box("FacturasSustituidas", idFactura("IDFacturaSustituida", r.substituted)));
  parts.push(el("DescripcionOperacion", r.invoiceType.startsWith("R") ? "Devolución de venta de comida y bebida" : "Venta de comida y bebida"));
  if (r.recipient) parts.push(box("Destinatarios", box("IDDestinatario", el("NombreRazon", cut(r.recipient.name, 120)) + el("NIF", r.recipient.nif))));
  parts.push(
    box(
      "Desglose",
      box(
        "DetalleDesglose",
        el("Impuesto", "01") + // IVA
          el("ClaveRegimen", "01") + // régimen general
          el("CalificacionOperacion", "S1") + // sujeta y no exenta
          el("TipoImpositivo", r.taxRate.toFixed(2)) +
          el("BaseImponibleOimporteNoSujeto", amount(r.baseCents)) +
          el("CuotaRepercutida", amount(r.taxCents)),
      ),
    ),
    el("CuotaTotal", amount(r.taxCents)),
    el("ImporteTotal", amount(r.totalCents)),
    box(
      "Encadenamiento",
      r.previous
        ? box("RegistroAnterior", el("IDEmisorFactura", r.previous.nif) + el("NumSerieFactura", r.previous.numSerie) + el("FechaExpedicionFactura", r.previous.issueDate) + el("Huella", r.previous.hash))
        : el("PrimerRegistro", "S"),
    ),
    box(
      "SistemaInformatico",
      el("NombreRazon", cut(sw.producerName, 120)) +
        el("NIF", sw.producerNif) +
        el("NombreSistemaInformatico", cut(sw.name, 30)) +
        el("IdSistemaInformatico", sw.id.slice(0, 2)) +
        el("Version", cut(sw.version, 50)) +
        el("NumeroInstalacion", cut(sw.installation, 100)) +
        el("TipoUsoPosibleSoloVerifactu", "S") +
        el("TipoUsoPosibleMultiOT", "S") +
        el("IndicadorMultiplesOT", "N"),
    ),
    el("FechaHoraHusoGenRegistro", r.genTimestamp),
    el("TipoHuella", "01"), // SHA-256
    el("Huella", r.hash),
  );
  return box("RegistroAlta", parts.join(""));
}

export function envelopeXml(header: SendHeader, records: AltaRecord[], sw: SoftwareInfo): string {
  const obligado = box("ObligadoEmision", el("NombreRazon", cut(header.issuerName, 120)) + el("NIF", header.issuerNif));
  const rep = header.representative ? box("Representante", el("NombreRazon", cut(header.representative.name, 120)) + el("NIF", header.representative.nif)) : "";
  const body = records.map((r) => `<sum:RegistroFactura>${altaXml(r, sw)}</sum:RegistroFactura>`).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sum="${NS_LR}" xmlns:sum1="${NS_SI}">` +
    `<soapenv:Header/><soapenv:Body><sum:RegFactuSistemaFacturacion>` +
    `<sum:Cabecera>${obligado}${rep}</sum:Cabecera>` +
    body +
    `</sum:RegFactuSistemaFacturacion></soapenv:Body></soapenv:Envelope>`
  );
}

// ─── Respuesta ─────────────────────────────────────────────────────────────
export type LineResult = {
  numSerie: string;
  status: "ACEPTADO" | "ACEPTADO_CON_ERRORES" | "RECHAZADO";
  code: string | null;
  description: string | null;
};
export type SendResult =
  | { ok: true; csv: string | null; waitSeconds: number; state: string; lines: LineResult[] }
  | { ok: false; fault: string };

const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
// Las respuestas usan prefijos variables (tikR:, tik:, env:…): se buscan sin prefijo.
function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`));
  return m ? unescape(m[1].trim()) : null;
}
function tags(xml: string, name: string): string[] {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, "g");
  return [...xml.matchAll(re)].map((m) => m[1]);
}

// Código 3000: el registro ya estaba en la AEAT (un reintento). Cuenta como aceptado.
const DUPLICATE = "3000";

export function parseResponse(xml: string): SendResult {
  const fault = tag(xml, "faultstring") ?? (tag(xml, "Fault") !== null ? "Error SOAP" : null);
  if (fault !== null) return { ok: false, fault: fault.slice(0, 500) };
  const state = tag(xml, "EstadoEnvio");
  if (!state) return { ok: false, fault: "La AEAT devolvió una respuesta que no se entiende" };
  const wait = Number(tag(xml, "TiempoEsperaEnvio") ?? "60");
  const lines: LineResult[] = tags(xml, "RespuestaLinea").map((l) => {
    const st = tag(l, "EstadoRegistro") ?? "";
    const code = tag(l, "CodigoErrorRegistro");
    const status: LineResult["status"] = st === "Correcto" || code === DUPLICATE ? "ACEPTADO" : st === "AceptadoConErrores" ? "ACEPTADO_CON_ERRORES" : "RECHAZADO";
    return { numSerie: tag(l, "NumSerieFactura") ?? "", status, code, description: tag(l, "DescripcionErrorRegistro")?.slice(0, 500) ?? null };
  });
  return { ok: true, csv: tag(xml, "CSV"), waitSeconds: Number.isFinite(wait) && wait > 0 ? Math.min(wait, 3600) : 60, state, lines };
}
