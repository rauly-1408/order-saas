import { describe, expect, it } from "vitest";
import forge from "node-forge";
import { envelopeXml, parseResponse, xmlEscape, type AltaRecord, type SoftwareInfo } from "../aeatXml";
import { CertError, nifFromSubject, parseP12 } from "../aeatCert";

const sw: SoftwareInfo = { producerName: "Fabricante & Cía, S.L.", producerNif: "B12345678", name: "NorApp", id: "NA", version: "1.0", installation: "tenant1" };
const base: AltaRecord = {
  id: { nif: "B04755617", numSerie: "T2026-000002", issueDate: "24-11-2026" },
  issuerName: "Carnes Frescas La Esperanza, S.L.",
  invoiceType: "F2",
  rectified: null,
  substituted: null,
  recipient: null,
  taxRate: 10,
  baseCents: 1000,
  taxCents: 100,
  totalCents: 1100,
  previous: { nif: "B04755617", numSerie: "T2026-000001", issueDate: "24-11-2026", hash: "AB".repeat(32) },
  genTimestamp: "2026-11-24T13:00:00+01:00",
  hash: "CD".repeat(32),
};
const header = { issuerName: base.issuerName, issuerNif: base.id.nif, representative: null };

describe("AEAT · mensaje de alta", () => {
  it("lleva los elementos en el orden del esquema", () => {
    const xml = envelopeXml(header, [base], sw);
    const order = ["IDVersion", "IDFactura", "NombreRazonEmisor", "TipoFactura", "DescripcionOperacion", "Desglose", "CuotaTotal", "ImporteTotal", "Encadenamiento", "SistemaInformatico", "FechaHoraHusoGenRegistro", "TipoHuella", "Huella"];
    const pos = order.map((t) => xml.lastIndexOf(`<sum1:${t}>`));
    expect(pos.every((p) => p > 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    expect(xml).toContain("<sum1:TipoImpositivo>10.00</sum1:TipoImpositivo>");
    expect(xml).toContain("<sum1:BaseImponibleOimporteNoSujeto>10.00</sum1:BaseImponibleOimporteNoSujeto>");
    expect(xml).toContain("<sum1:ImporteTotal>11.00</sum1:ImporteTotal>");
    expect(xml).toContain(`<sum1:RegistroAnterior><sum1:IDEmisorFactura>B04755617</sum1:IDEmisorFactura><sum1:NumSerieFactura>T2026-000001</sum1:NumSerieFactura>`);
    expect(xml).toContain("Fabricante &amp; Cía, S.L.");
    expect(xml).not.toContain("Representante");
  });

  it("primer registro, rectificativa y representante", () => {
    const r5: AltaRecord = { ...base, invoiceType: "R5", rectified: { nif: "B04755617", numSerie: "T2026-000001", issueDate: "24-11-2026" }, baseCents: -1000, taxCents: -100, totalCents: -1100, previous: null };
    const xml = envelopeXml({ ...header, representative: { name: "Gestoría", nif: "12345678Z" } }, [r5], sw);
    expect(xml).toContain("<sum1:PrimerRegistro>S</sum1:PrimerRegistro>");
    expect(xml).toContain("<sum1:TipoRectificativa>I</sum1:TipoRectificativa><sum1:FacturasRectificadas>");
    expect(xml).toContain("<sum1:ImporteTotal>-11.00</sum1:ImporteTotal>");
    expect(xml).toContain("<sum1:Representante><sum1:NombreRazon>Gestoría</sum1:NombreRazon><sum1:NIF>12345678Z</sum1:NIF></sum1:Representante>");
  });

  it("factura completa que sustituye: destinatario y sustituida", () => {
    const f3: AltaRecord = { ...base, invoiceType: "F3", substituted: { nif: "B04755617", numSerie: "T2026-000001", issueDate: "24-11-2026" }, recipient: { nif: "B87654321", name: "Cliente <S.L.>" } };
    const xml = envelopeXml(header, [f3], sw);
    expect(xml.indexOf("FacturasSustituidas")).toBeLessThan(xml.indexOf("DescripcionOperacion"));
    expect(xml.indexOf("Destinatarios")).toBeGreaterThan(xml.indexOf("DescripcionOperacion"));
    expect(xml).toContain("Cliente &lt;S.L.&gt;");
  });

  it("escapa los caracteres especiales", () => {
    expect(xmlEscape(`a&b<c>"d'`)).toBe("a&amp;b&lt;c&gt;&quot;d&apos;");
  });
});

describe("AEAT · respuesta", () => {
  const resp = (lines: string) =>
    `<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body><tikR:RespuestaRegFactuSistemaFacturacion xmlns:tikR="x" xmlns:tik="y"><tikR:CSV>A-ABC123</tikR:CSV><tikR:TiempoEsperaEnvio>60</tikR:TiempoEsperaEnvio><tikR:EstadoEnvio>ParcialmenteCorrecto</tikR:EstadoEnvio>${lines}</tikR:RespuestaRegFactuSistemaFacturacion></env:Body></env:Envelope>`;
  const line = (num: string, st: string, extra = "") =>
    `<tikR:RespuestaLinea><tikR:IDFactura><tik:IDEmisorFactura>B04755617</tik:IDEmisorFactura><tik:NumSerieFactura>${num}</tik:NumSerieFactura><tik:FechaExpedicionFactura>24-11-2026</tik:FechaExpedicionFactura></tikR:IDFactura><tikR:EstadoRegistro>${st}</tikR:EstadoRegistro>${extra}</tikR:RespuestaLinea>`;

  it("lee el estado de cada factura", () => {
    const r = parseResponse(
      resp(
        line("T1", "Correcto") +
          line("T2", "AceptadoConErrores", "<tikR:CodigoErrorRegistro>2000</tikR:CodigoErrorRegistro><tikR:DescripcionErrorRegistro>Aviso &amp; tal</tikR:DescripcionErrorRegistro>") +
          line("T3", "Incorrecto", "<tikR:CodigoErrorRegistro>1100</tikR:CodigoErrorRegistro><tikR:DescripcionErrorRegistro>Valor no válido</tikR:DescripcionErrorRegistro>") +
          line("T4", "Incorrecto", "<tikR:CodigoErrorRegistro>3000</tikR:CodigoErrorRegistro>"),
      ),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.csv).toBe("A-ABC123");
    expect(r.waitSeconds).toBe(60);
    expect(r.lines.map((l) => [l.numSerie, l.status])).toEqual([
      ["T1", "ACEPTADO"],
      ["T2", "ACEPTADO_CON_ERRORES"],
      ["T3", "RECHAZADO"],
      ["T4", "ACEPTADO"], // duplicado: ya estaba en la AEAT
    ]);
    expect(r.lines[1].description).toBe("Aviso & tal");
  });

  it("un error SOAP deja todo pendiente", () => {
    const r = parseResponse(`<env:Envelope><env:Body><env:Fault><faultcode>env:Client</faultcode><faultstring>Codigo[4102].El XML no cumple el esquema</faultstring></env:Fault></env:Body></env:Envelope>`);
    expect(r).toEqual({ ok: false, fault: "Codigo[4102].El XML no cumple el esquema" });
    expect(parseResponse("<html>Error 500</html>").ok).toBe(false);
  });
});

describe("AEAT · certificado", () => {
  function makeP12(password: string, subject: { shortName?: string; type?: string; value: string }[], days = 365) {
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + days * 86_400_000);
    cert.setSubject(subject);
    cert.setIssuer(subject);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: "3des" });
    return Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary");
  }
  const subject = [
    { shortName: "CN", value: "CARNES FRESCAS LA ESPERANZA SL - B04755617" },
    { shortName: "O", value: "CARNES FRESCAS LA ESPERANZA SL" },
    { type: "2.5.4.97", value: "VATES-B04755617" },
  ];
  const file = makeP12("secreto-de-prueba", subject);

  it("lee titular, NIF, caducidad y saca la clave en PEM", () => {
    const c = parseP12(file, "secreto-de-prueba");
    expect(c.holderName).toBe("CARNES FRESCAS LA ESPERANZA SL");
    expect(c.holderNif).toBe("B04755617");
    expect(c.keyPem).toContain("BEGIN RSA PRIVATE KEY");
    expect(c.certPem).toContain("BEGIN CERTIFICATE");
    expect(c.notAfter.getTime()).toBeGreaterThan(Date.now());
  });

  it("contraseña mala, archivo raro o caducado", () => {
    expect(() => parseP12(file, "otra")).toThrow(CertError);
    expect(() => parseP12(Buffer.from("hola"), "x")).toThrow(/no parece un certificado/);
    expect(() => parseP12(makeP12("p", subject, -2), "p")).toThrow(/caducó/);
  });

  it("NIF del sujeto en sus formatos habituales", () => {
    expect(nifFromSubject(["IDCES-12345678Z"])).toBe("12345678Z");
    expect(nifFromSubject([null, "VATES-B04755617"])).toBe("B04755617");
    expect(nifFromSubject(["nada"])).toBeNull();
  });
});
