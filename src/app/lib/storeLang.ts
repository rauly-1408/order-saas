// Idioma de la visita en las páginas de la tienda (servidor): el que eligió el
// cliente con el botón ES/EN (cookie) o el de su navegador.
import { cookies, headers } from "next/headers";
import { enabledLangs, LANG_COOKIE, pickLang, type Lang } from "@/app/lib/i18n";

export async function storeLang(settings: unknown): Promise<Lang> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return pickLang(c.get(LANG_COOKIE)?.value, h.get("accept-language"), enabledLangs(settings));
}
