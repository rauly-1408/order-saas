// Roles del panel. Sin imports de Next: se puede usar en servidor y cliente.
//   SUPERADMIN    → todos los restaurantes
//   TENANT_ADMIN  → todo su restaurante (carta, personalización, configuración, pedidos)
//   STORE_MANAGER → solo Pedidos de su restaurante

export function canManageTenant(role: string): boolean {
  return role === "SUPERADMIN" || role === "TENANT_ADMIN";
}
