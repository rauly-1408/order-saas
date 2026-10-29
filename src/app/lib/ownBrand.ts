// Restaurantes con app de marca propia: el panel no enseña NorApp (ni el logo
// arriba del menú ni la pantalla de carga) y su logo va arriba, como siempre.
// Es Estafetén y su franquicia; el resto de restaurantes llevan la marca NorApp.
// Se puede ampliar sin tocar código con NORAPP_OWN_BRAND="estafeten,otro".
// Ver docs/MARCA-NORAPP.md
const DEFAULT = ["estafeten"];

export function isOwnBrand(tenantSlug: string): boolean {
  const list = (process.env.NORAPP_OWN_BRAND ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return (list.length ? list : DEFAULT).includes(tenantSlug);
}
