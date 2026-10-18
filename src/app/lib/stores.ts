// Sucursales: un restaurante puede tener varios locales (Store). Cada uno tiene
// su horario, cierres, pausa y zonas de reparto; los canales, precios y tiempos
// son comunes. Ver docs/CONFIGURACION.md
import { prisma } from "@/app/lib/prisma";

export const PANEL_STORE_COOKIE = "panel_store"; // local que se está configurando en el panel
export { SHOP_STORE_COOKIE_NAME as SHOP_STORE_COOKIE } from "@/app/lib/shopStore"; // local elegido por el cliente en la tienda

export type StoreSummary = { id: string; name: string; address: string | null; active: boolean };

export async function listStores(tenantId: string, opts: { activeOnly?: boolean } = {}): Promise<StoreSummary[]> {
  return prisma.store.findMany({
    where: { tenantId, ...(opts.activeOnly && { active: true }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, address: true, active: true },
  });
}

// El local pedido si es de este restaurante (y está abierto al público, si se
// exige); si no, el primero. null si el restaurante no tiene ninguno.
export async function resolveStoreId(tenantId: string, wanted: string | null | undefined, opts: { activeOnly?: boolean } = {}): Promise<string | null> {
  const stores = await listStores(tenantId, opts);
  return stores.find((s) => s.id === wanted)?.id ?? stores[0]?.id ?? null;
}
