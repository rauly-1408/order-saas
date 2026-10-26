import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { collaboratorDashboard } from "@/app/lib/collaboratorDashboard";
import ColaboradorLive from "./ColaboradorLive";

// App del colaborador (RRPP, encargado de hotel…): su código, su enlace y su QR,
// y lo que lleva ganado al momento. Se puede instalar en el móvil y abre solo su
// perfil. Sin datos de clientes. El enlace es secreto: se puede cambiar desde el
// panel. Ver docs/COLABORADORES.md

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "Mis ventas",
    robots: { index: false, follow: false },
    manifest: `/colaborador/${token}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: "Mis ventas", statusBarStyle: "default" },
  };
}

export default async function ColaboradorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await collaboratorDashboard(token);
  if (!data) notFound();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const link = `${proto}://${host}/pedir/${data.tenantSlug}?c=${data.code}`;
  const qr = await QRCode.toString(link, { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 220 });
  return <ColaboradorLive token={token} initial={data} link={link} qrSvg={qr} />;
}
