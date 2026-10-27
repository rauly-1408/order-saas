import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/app/lib/session";

// Next.js 16: "Thin Proxy". Dos trabajos:
// 1) Dominio propio (Configuración → Dominios): si se entra por el dominio de un
//    restaurante, se abre su tienda (/pedir/[slug]) sin cambiar la dirección.
// 2) Panel: aquí SOLO se comprueba la EXISTENCIA de la cookie de sesión
//    (chequeo optimista, sin verificar la firma ni tocar la DB).
//    La validación real (firma del JWT + usuario activo + scope de tenant)
//    ocurre en las páginas (getSession) y en las rutas API (getSessionFromRequest).

// Dominio → restaurante, en memoria unos minutos para no consultarlo en cada visita.
const domainCache = new Map<string, { slug: string | null; until: number }>();
const CACHE_MS = 5 * 60_000;

function isPlatformHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app") || host.endsWith(".localhost") || host === (process.env.APP_HOST ?? "");
}

async function slugForDomain(req: NextRequest, host: string): Promise<string | null> {
  const hit = domainCache.get(host);
  if (hit && hit.until > Date.now()) return hit.slug;
  let slug: string | null = null;
  try {
    const res = await fetch(new URL(`/api/domains/resolve?host=${encodeURIComponent(host)}`, req.url), { signal: AbortSignal.timeout(3000) });
    slug = res.ok ? ((await res.json()) as { slug: string | null }).slug : null;
  } catch {}
  domainCache.set(host, { slug, until: Date.now() + CACHE_MS });
  return slug;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();

  // 1) Dominio propio: todo lo que no sea tienda, API ni panel abre la tienda.
  if (host && !isPlatformHost(host) && !/^\/(pedir|api|admin|pwa|colaborador)(\/|$)/.test(pathname) && pathname !== "/sw.js") {
    const slug = await slugForDomain(req, host);
    if (slug) {
      const url = req.nextUrl.clone();
      url.pathname = `/pedir/${slug}${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  if (!pathname.startsWith("/admin")) return NextResponse.next();

  // 2) Entrar y recuperar la contraseña tienen que funcionar sin sesión.
  if (/\/(login|recuperar|restablecer)$/.test(pathname)) {
    return NextResponse.next();
  }

  const hasSessionCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSessionCookie) {
    const tenant = pathname.split("/")[2] ?? "";
    const url = req.nextUrl.clone();
    url.pathname = `/admin/${tenant}/login`;
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Todo menos los ficheros estáticos de Next (el dominio propio necesita ver la portada).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
