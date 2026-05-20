import { headers } from "next/headers";
import CheckoutClient from "./CheckoutClient";
import type { TenantTheme, StoreSettings } from "@/app/lib/tenantConfig";

type MenuResponse = {
  tenant: { id: string; name: string; slug: string };
  theme: TenantTheme;
  settings: StoreSettings;
};

async function getTenantConfig(tenant: string): Promise<{ theme?: TenantTheme; settings?: StoreSettings }> {
  try {
    const h = await headers();
    const host = h.get("host");
    const proto = process.env.NODE_ENV === "development" ? "http" : "https";
    if (!host) return {};
    const res = await fetch(`${proto}://${host}/api/menu/${tenant}`, { cache: "no-store" });
    if (!res.ok) return {};
    const data: MenuResponse = await res.json();
    return { theme: data.theme, settings: data.settings };
  } catch {
    return {};
  }
}

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const { theme, settings } = await getTenantConfig(tenant);
  return <CheckoutClient tenant={tenant} theme={theme} settings={settings} />;
}
