import { headers } from "next/headers";
import MenuClient from "./MenuClient";
import type { TenantTheme, StoreSettings } from "@/app/lib/tenantConfig";

type MenuProduct = {
  id: string;
  name: string;
  description: string;
  basePriceCents: number;
  imageUrl?: string | null;
  isFeatured?: boolean;
  hasModifiers?: boolean;
};

type MenuCategory = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isFeatured: boolean;
  description?: string | null;
  imageUrl?: string | null;
  products: MenuProduct[];
};

type MenuResponse = {
  tenant: { id: string; name: string; slug: string };
  theme: TenantTheme;
  settings: StoreSettings;
  categories: MenuCategory[];
};

async function getMenu(tenant: string): Promise<MenuResponse> {
  const h = await headers();
  const host = h.get("host");
  const proto = process.env.NODE_ENV === "development" ? "http" : "https";

  if (!host) throw new Error("No se pudo determinar el host");

  const res = await fetch(`${proto}://${host}/api/menu/${tenant}`, {
    cache: "no-store",
  });

  if (!res.ok) throw new Error("No se pudo cargar el menu");
  return res.json();
}

export default async function PedirPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const data = await getMenu(tenant);

  return (
    <MenuClient
      tenant={tenant}
      tenantName={data.tenant.name}
      categories={data.categories}
      theme={data.theme}
      settings={data.settings}
    />
  );
}
