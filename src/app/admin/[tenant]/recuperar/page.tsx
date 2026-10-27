import { Anton, Inter } from "next/font/google";
import { prisma } from "@/app/lib/prisma";
import { panelBrand, panelCssVars } from "@/app/lib/panelTheme";
import ForgotForm from "./ForgotForm";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Anton({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });

// «¿Has olvidado tu contraseña?»: pide el email y manda un enlace para cambiarla.
export default async function RecuperarPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { name: true, branding: true } });
  return (
    <div className={`panel ${inter.variable} ${display.variable}`} style={panelCssVars(panelBrand(t?.branding))}>
      <ForgotForm tenant={tenant} tenantName={t?.name ?? tenant} />
    </div>
  );
}
