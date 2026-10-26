import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/app/lib/prisma";
import { collaboratorByToken } from "@/app/lib/collaboratorDashboard";
import PrintButton from "./PrintButton";

// Tarjetas VIP del colaborador para imprimir: tamaño tarjeta de visita
// (85 × 55 mm), 10 por folio A4, con el logo, su código y el QR de la tienda.
// En pantalla se ve una de muestra. Ver docs/COLABORADORES.md

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tarjetas para imprimir", robots: { index: false, follow: false } };

export default async function TarjetasPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await collaboratorByToken(token);
  if (!c) notFound();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const link = `${proto}://${host}/pedir/${c.tenantSlug}?c=${c.code}`;
  const qr = await QRCode.toString(link, { type: "svg", errorCorrectionLevel: "M", margin: 0 });
  const logo = await prisma.brandAsset.findFirst({ where: { tenantId: c.tenantId, kind: "LOGO" }, select: { updatedAt: true } });
  const logoUrl = logo ? `/api/brand/${c.tenantSlug}/logo?v=${logo.updatedAt.getTime()}` : null;

  // El código cabe siempre en la tarjeta: más pequeño cuanto más largo (hasta 20 letras).
  const codeSize = c.code.length <= 8 ? "text-[17pt] tracking-widest" : c.code.length <= 12 ? "text-[12pt] tracking-wider" : "text-[9pt] tracking-wide";
  const card = (
    <div className="flex h-[55mm] w-[85mm] overflow-hidden rounded-[3mm] border border-black/15 bg-white text-[#1d1d1f]">
      <div className="flex min-w-0 flex-1 flex-col justify-between p-[4mm]">
        <div>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={c.tenantName} className="h-[9mm] max-w-[40mm] object-contain object-left" />
          ) : (
            <p className="truncate text-[13pt] leading-tight font-bold">{c.tenantName}</p>
          )}
          <p className="mt-[1.5mm] text-[6.5pt] font-semibold tracking-[0.2em] text-black/50 uppercase">Tarjeta VIP</p>
        </div>
        <div>
          <p className="text-[7.5pt] text-black/60">Pide online con mi código</p>
          <p className={`${codeSize} leading-none font-bold break-all`}>{c.code}</p>
          <p className="mt-[1.5mm] text-[6.5pt] leading-snug text-black/55">Escanea el QR o escribe el código al pagar.</p>
        </div>
      </div>
      <div className="flex w-[34mm] shrink-0 flex-col items-center justify-center bg-[#f5f5f7] p-[3mm]">
        <div className="w-[28mm] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
        <p className="mt-[1.5mm] text-[6pt] font-semibold text-black/55">Escanea y pide</p>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#f5f5f7] px-4 py-6 text-[#1d1d1f] print:bg-white print:p-0">
      <style>{"@page { size: A4; margin: 10mm; }"}</style>
      <div className="mx-auto max-w-md print:hidden">
        <a href={`/colaborador/${token}`} className="text-sm font-semibold text-[#6e6e73]">
          ← Volver
        </a>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Tus tarjetas VIP</h1>
        <p className="mt-1 text-sm text-[#6e6e73]">Salen 10 por folio, del tamaño de una tarjeta de visita. Mejor en cartulina; recorta por el borde.</p>
        <div className="mt-5 flex justify-center">{card}</div>
        <PrintButton />
      </div>
      <div className="hidden grid-cols-2 justify-center gap-x-[4mm] gap-y-[3mm] print:grid">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="break-inside-avoid">
            {card}
          </div>
        ))}
      </div>
    </main>
  );
}
