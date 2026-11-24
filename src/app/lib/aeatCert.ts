// VeriFactu: lectura del certificado digital del restaurante (.p12 / .pfx).
// Se convierte a PEM al subirlo (node-forge entiende también los .p12 antiguos
// de la FNMT que OpenSSL 3 ya no abre) y se guarda cifrado. Ver docs/VERIFACTU.md
import forge from "node-forge";
import { normalizeTaxId, TAX_ID } from "@/app/lib/business";

export const MAX_CERT_BYTES = 50_000;

export type ParsedCert = {
  keyPem: string;
  certPem: string; // el del titular y, detrás, los intermedios que traiga el archivo
  holderName: string;
  holderNif: string | null;
  notBefore: Date;
  notAfter: Date;
};

export class CertError extends Error {}

type Attr = { shortName?: string; name?: string; type?: string; value?: unknown };
const attrValue = (attrs: Attr[], ...keys: string[]) => {
  for (const a of attrs) {
    if (keys.includes(a.shortName ?? "") || keys.includes(a.name ?? "") || keys.includes(a.type ?? "")) {
      if (typeof a.value === "string" && a.value.trim()) return forge.util.decodeUtf8(a.value).trim();
    }
  }
  return null;
};

// El NIF va en el «serialNumber» (2.5.4.5) o en el «organizationIdentifier»
// (2.5.4.97) del sujeto: «IDCES-12345678Z», «VATES-B12345678» o solo el NIF.
export function nifFromSubject(values: (string | null)[]): string | null {
  for (const v of values) {
    if (!v) continue;
    const raw = normalizeTaxId(v.replace(/^(IDCES|VATES|NTRES|PASES)-?/i, ""));
    if (TAX_ID.test(raw)) return raw;
  }
  return null;
}

export function parseP12(file: Buffer, password: string): ParsedCert {
  if (!file.length || file.length > MAX_CERT_BYTES) throw new CertError("El archivo no parece un certificado (.p12 o .pfx)");
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(file.toString("binary")));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/mac|password|invalid/i.test(msg)) throw new CertError("La contraseña del certificado no es correcta");
    throw new CertError("El archivo no parece un certificado (.p12 o .pfx)");
  }

  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  const key = keyBags.find((b) => b.key)?.key;
  if (!key) throw new CertError("El archivo no trae la clave privada. Exporta el certificado «con la clave privada»");

  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).map((b) => b.cert).filter((c): c is forge.pki.Certificate => Boolean(c));
  // El del titular es el que casa con la clave privada.
  const pub = forge.pki.rsa.setPublicKey((key as forge.pki.rsa.PrivateKey).n, (key as forge.pki.rsa.PrivateKey).e);
  const pubPem = forge.pki.publicKeyToPem(pub);
  const leaf = certs.find((c) => forge.pki.publicKeyToPem(c.publicKey as forge.pki.rsa.PublicKey) === pubPem);
  if (!leaf) throw new CertError("El archivo no trae el certificado de la clave privada");
  const chain = certs.filter((c) => c !== leaf);

  const attrs = leaf.subject.attributes as Attr[];
  const holderName = attrValue(attrs, "O", "organizationName") ?? attrValue(attrs, "CN", "commonName") ?? "Titular sin nombre";
  const holderNif = nifFromSubject([attrValue(attrs, "serialNumber", "2.5.4.5"), attrValue(attrs, "2.5.4.97", "organizationIdentifier"), attrValue(attrs, "CN", "commonName")?.match(/[A-Z0-9]{9}/i)?.[0] ?? null]);

  const now = new Date();
  if (leaf.validity.notAfter < now) throw new CertError(`El certificado caducó el ${leaf.validity.notAfter.toLocaleDateString("es-ES")}. Renuévalo y súbelo de nuevo`);

  return {
    keyPem: forge.pki.privateKeyToPem(key),
    certPem: [leaf, ...chain].map((c) => forge.pki.certificateToPem(c)).join(""),
    holderName,
    holderNif,
    notBefore: leaf.validity.notBefore,
    notAfter: leaf.validity.notAfter,
  };
}
