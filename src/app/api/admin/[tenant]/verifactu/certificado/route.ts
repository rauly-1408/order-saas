import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { rateLimit } from "@/app/lib/rateLimit";
import { CertError, MAX_CERT_BYTES, parseP12 } from "@/app/lib/aeatCert";
import { queueAeatSend, sealCert } from "@/app/lib/aeatSend";
import { readBusiness } from "@/app/lib/business";
import { ctx, payload } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Certificado digital del restaurante para enviar las facturas a la AEAT.
//   POST (multipart: file .p12/.pfx, password) → lo lee, lo cifra y lo guarda
//   DELETE → lo borra
// El archivo y la contraseña no se guardan: solo la clave y el certificado,
// cifrados. Nunca se devuelven al navegador.

export async function POST(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const limited = await rateLimit(req, "aeat-cert", 10, 600);
  if (limited) return limited;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const password = form?.get("password");
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: "Elige el archivo del certificado (.p12 o .pfx)" }, { status: 400 });
  if (file.size > MAX_CERT_BYTES) return NextResponse.json({ error: "El archivo es demasiado grande para ser un certificado" }, { status: 400 });
  if (typeof password !== "string") return NextResponse.json({ error: "Escribe la contraseña del certificado" }, { status: 400 });

  let parsed;
  try {
    parsed = parseP12(Buffer.from(await file.arrayBuffer()), password);
  } catch (err) {
    if (err instanceof CertError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[aeat] certificado", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "No se pudo leer el certificado" }, { status: 400 });
  }

  const data = { certSealed: sealCert(parsed), holderName: parsed.holderName, holderNif: parsed.holderNif, notAfter: parsed.notAfter, uploadedAt: new Date(), lastError: null };
  await prisma.verifactuSender.upsert({ where: { tenantId: c.tenant.id }, create: { tenantId: c.tenant.id, ...data }, update: data });
  queueAeatSend(c.tenant.id); // lo que estaba pendiente sale ya

  const biz = readBusiness(c.tenant.settings);
  const nif = (biz.taxId ?? "").replace(/\s|-/g, "").toUpperCase();
  const warning =
    parsed.holderNif && nif && parsed.holderNif !== nif
      ? `El certificado es de ${parsed.holderName} (${parsed.holderNif}), no del restaurante (${nif}). Solo sirve si está apoderado ante la AEAT para presentar en su nombre.`
      : null;
  return NextResponse.json({ ...(await payload(c.tenant.id, c.tenant.settings, c.sees)), warning });
}

export async function DELETE(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  await prisma.verifactuSender.updateMany({ where: { tenantId: c.tenant.id }, data: { certSealed: null, holderName: null, holderNif: null, notAfter: null, uploadedAt: null } });
  return NextResponse.json(await payload(c.tenant.id, c.tenant.settings, c.sees));
}
