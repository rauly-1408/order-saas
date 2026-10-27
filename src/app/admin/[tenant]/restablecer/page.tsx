import { Anton, Inter } from "next/font/google";
import { prisma } from "@/app/lib/prisma";
import { panelBrand, panelCssVars } from "@/app/lib/panelTheme";
import { resetTokenValid } from "@/app/lib/passwordReset";
import ResetForm from "./ResetForm";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Anton({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });

// Enlace del email: si sigue valiendo, formulario para la contraseña nueva.
export default async function RestablecerPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ t?: string }> }) {
  const { tenant } = await params;
  const { t: token = "" } = await searchParams;
  const [t, valid] = await Promise.all([prisma.tenant.findUnique({ where: { slug: tenant }, select: { name: true, branding: true } }), resetTokenValid(token)]);
  return (
    <div className={`panel ${inter.variable} ${display.variable}`} style={panelCssVars(panelBrand(t?.branding))}>
      <ResetForm tenant={tenant} tenantName={t?.name ?? tenant} token={token} valid={valid} />
    </div>
  );
}
