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

// Local para un usuario del panel: si está limitado a un local, ese y ningún
// otro (null si no existe o no está activo); si no, el pedido o el primero.
export async function storeForSession(tenantId: string, sessionStoreId: string | null | undefined, wanted: string | null | undefined): Promise<string | null> {
  if (sessionStoreId) {
    const stores = await listStores(tenantId, { activeOnly: true });
    return stores.some((s) => s.id === sessionStoreId) ? sessionStoreId : null;
  }
  return resolveStoreId(tenantId, wanted, { activeOnly: true });
}

// El local pedido si es de este restaurante (y está abierto al público, si se
// exige); si no, el primero. null si el restaurante no tiene ninguno.
export async function resolveStoreId(tenantId: string, wanted: string | null | undefined, opts: { activeOnly?: boolean } = {}): Promise<string | null> {
  const stores = await listStores(tenantId, opts);
  return stores.find((s) => s.id === wanted)?.id ?? stores[0]?.id ?? null;
}
