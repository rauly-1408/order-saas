import { headers } from "next/headers";
import MenuClient from "./MenuClient";

type MenuProduct = {
  id: string;
  name: string;
  description: string;
  basePriceCents: number;
};

type MenuCategory = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isFeatured: boolean;
  products: MenuProduct[];
};

type MenuResponse = {
  tenant: { name: string; slug: string };
  categories: MenuCategory[];
};

async function getMenu(tenant: string): Promise<MenuResponse> {
  const h = await headers();
  const host = h.get("host");
  const proto = process.env.NODE_ENV === "development" ? "http" : "https";

  if (!host) {
    throw new Error("No se pudo determinar el host para cargar el menú");
  }

  const res = await fetch(`${proto}://${host}/api/menu/${tenant}`, {
    cache: "no-store",
  });

  if (!res.ok) throw new Error("No se pudo cargar el menú");
  return res.json();
}

export default async function PedirPage({
  params,
}: {
  params: { tenant: string };
}) {
  const data = await getMenu(params.tenant);

  // Delegamos render+carrito+drawer al componente cliente
  return <MenuClient tenantName={data.tenant.name} categories={data.categories} />;
}

