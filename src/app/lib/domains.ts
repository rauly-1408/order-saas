// Dominio propio (Configuración → Dominios): la tienda se abre en la web del
// restaurante, p. ej. pedidos.estafeten.com. El restaurante crea un CNAME a
// Vercel y el dominio se añade al proyecto en Vercel. Ver docs/CONFIGURACION.md
import { resolve4, resolveCname } from "node:dns/promises";

export const VERCEL_CNAME = "cname.vercel-dns.com";
export const VERCEL_A = "76.76.21.21";

const HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeDomain(raw: string): string | null {
  const host = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!HOST.test(host)) return null;
  if (/(^|\.)(vercel\.app|localhost)$/.test(host)) return null;
  return host;
}

// ¿Apunta ya a Vercel? (CNAME a cname.vercel-dns.com o A a 76.76.21.21)
export async function dnsStatus(host: string): Promise<"ok" | "pending"> {
  try {
    const cname = await resolveCname(host);
    if (cname.some((c) => c.replace(/\.$/, "").endsWith("vercel-dns.com"))) return "ok";
  } catch {}
  try {
    const a = await resolve4(host);
    if (a.includes(VERCEL_A)) return "ok";
  } catch {}
  return "pending";
}
