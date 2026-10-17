// Marco de las páginas de pago (vuelta de la pasarela y modo prueba), con los
// colores de la marca del restaurante.
import { prisma } from "@/app/lib/prisma";
import { getTenantTheme, themeToCssVars, SYSTEM_DEFAULT_THEME } from "@/app/lib/tenantConfig";
import { storeLang } from "@/app/lib/storeLang";

export async function paymentShellData(slug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true, branding: true, settings: true } });
  const lang = await storeLang(tenant?.settings);
  const cssVars = themeToCssVars(getTenantTheme((tenant?.branding as Record<string, unknown>) ?? {}) ?? SYSTEM_DEFAULT_THEME);
  return { tenant, lang, cssVars };
}

export function PaymentShell({ name, cssVars, children }: { name: string; cssVars: Record<string, string>; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]" style={{ fontFamily: cssVars["--font-body"], ...(cssVars as React.CSSProperties) }}>
      <header className="flex h-14 items-center border-b border-[var(--border)] bg-[var(--surface-0)] px-5">
        <span className="text-base font-semibold">{name}</span>
      </header>
      <main className="mx-auto max-w-md px-4 py-12 text-center">{children}</main>
    </div>
  );
}
