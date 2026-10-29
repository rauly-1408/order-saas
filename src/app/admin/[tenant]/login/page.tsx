import { Anton, Inter } from "next/font/google";
import { prisma } from "@/app/lib/prisma";
import { panelBrand, panelCssVars } from "@/app/lib/panelTheme";
import { isOwnBrand } from "@/app/lib/ownBrand";
import LoginForm from "./LoginForm";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Anton({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });

export default async function LoginPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  // Marca del restaurante (sin datos sensibles): nombre y colores para el login.
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { name: true, branding: true } });

  return (
    <div className={`panel ${inter.variable} ${display.variable}`} style={panelCssVars(panelBrand(t?.branding))}>
      <LoginForm tenant={tenant} tenantName={t?.name ?? tenant} norapp={!isOwnBrand(tenant)} />
    </div>
  );
}
