// Local elegido por el cliente en la tienda (sucursales). Sin dependencias de
// servidor: se usa en el navegador. Ver lib/stores.ts
export const SHOP_STORE_COOKIE_NAME = "pedir_store";

export function rememberStore(storeId: string): void {
  document.cookie = `${SHOP_STORE_COOKIE_NAME}=${encodeURIComponent(storeId)}; path=/; max-age=31536000; samesite=lax`;
}
