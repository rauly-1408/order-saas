import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/app/lib/session";

// Next.js 16: "Thin Proxy". Aquí SOLO se comprueba la EXISTENCIA de la cookie
// de sesión (chequeo optimista, sin verificar la firma ni tocar la DB).
// La validación real (firma del JWT + scope de tenant) ocurre en:
//   - src/app/admin/[tenant]/page.tsx  (getSession)
//   - las rutas API                     (getSessionFromRequest)
// Por eso, aunque alguien falsee la cookie para pasar este redirect,
// la página y las APIs lo rechazan igual.

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // La página de login debe ser accesible sin sesión.
  if (pathname.endsWith("/login")) {
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
  matcher: ["/admin/:path*"],
};
