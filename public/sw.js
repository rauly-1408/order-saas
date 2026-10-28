// Service worker del panel. Dos trabajos:
// 1) Avisos en el móvil (Web Push): enseña el aviso y, al tocarlo, abre la
//    pantalla que corresponde. Ver docs/AVISOS-MOVIL.md
// 2) Panel sin internet: guarda en el aparato las pantallas del panel y sus
//    archivos para que se abran y se recarguen aunque se caiga la conexión.
//    Las páginas van «primero la red»: con internet siempre se ve lo último.
//    Los datos (la API) no se guardan aquí: Caja y Mesas tienen su propia cola.
//    Ver docs/SIN-CONEXION.md
const PAGES = "panel-pages-v1";
const STATIC = "panel-static-v1";
const NETWORK_TIMEOUT_MS = 4000; // con wifi a medias, no esperar eternamente
const STATIC_MAX = 400;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const isPanelPage = (url) => /^\/admin\/[^/]+\/(?!login|recuperar|restablecer)/.test(url.pathname);
const isStatic = (url) => url.pathname.startsWith("/_next/static/");

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// Una página del panel: de la red (y se guarda); si no hay red, la guardada.
async function panelPage(request) {
  const cache = await caches.open(PAGES);
  const key = new URL(request.url);
  key.search = "";
  try {
    const res = await Promise.race([fetch(request), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), NETWORK_TIMEOUT_MS))]);
    // Solo se guardan las páginas de verdad (no la redirección al login).
    if (res.ok && !res.redirected) cache.put(key.href, res.clone());
    return res;
  } catch {
    return (await cache.match(key.href)) ?? offlinePage(key.pathname.replace(/^(\/admin\/[^/]+).*/, "$1"));
  }
}

// Archivos de la app (llevan su huella en el nombre: nunca cambian).
async function staticFile(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    trim(cache, STATIC_MAX);
  }
  return res;
}

function offlinePage(base) {
  const btn = "display:inline-block;font-weight:600;text-decoration:none;border-radius:999px;padding:12px 22px;margin:4px";
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title>
  <body style="margin:0;display:grid;place-items:center;min-height:100vh;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f7;color:#1d1d1f;text-align:center;padding:24px">
  <div><p style="font-size:20px;font-weight:600;margin:0 0 8px">Sin conexión</p>
  <p style="margin:0 0 20px;color:#6e6e73">Esta pantalla necesita internet. La Caja y las Mesas funcionan sin conexión.</p>
  <a href="${base}/caja" style="${btn};background:#1d1d1f;color:#fff">Ir a la Caja</a><a href="${base}/mesas" style="${btn};background:#fff;color:#1d1d1f">Ir a Mesas</a>
  <p style="margin:20px 0 0"><button onclick="location.reload()" style="font:inherit;border:0;background:none;color:#6e6e73;text-decoration:underline">Reintentar</button></p></div></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Navegación interna de Next (RSC): sin red, que falle y Next abra la página
  // entera, que sí sale de la caché.
  if (request.headers.get("RSC") === "1") return;
  if (request.mode === "navigate" && isPanelPage(url)) return event.respondWith(panelPage(request));
  if (isStatic(url)) return event.respondWith(staticFile(request));
});

// Al entrar en el panel se guardan de antemano las pantallas de trabajo y sus
// archivos, para que estén aunque hoy no se hayan abierto.
async function warm(urls) {
  const pages = await caches.open(PAGES);
  const statics = await caches.open(STATIC);
  for (const u of urls) {
    try {
      const res = await fetch(u, { credentials: "same-origin" });
      if (!res.ok || res.redirected) continue;
      const html = await res.clone().text();
      await pages.put(new URL(u, self.location.origin).href, res);
      const assets = [...new Set(html.match(/\/_next\/static\/[^"'\\\s)]+/g) ?? [])];
      for (const a of assets) {
        if (await statics.match(a)) continue;
        const r = await fetch(a).catch(() => null);
        if (r && r.ok) await statics.put(a, r);
      }
    } catch {}
  }
  await trim(statics, STATIC_MAX);
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "warm" && Array.isArray(data.urls)) event.waitUntil(warm(data.urls));
  // Al cerrar sesión, fuera las pantallas guardadas: no deben verse sin entrar.
  if (data.type === "logout") event.waitUntil(caches.delete(PAGES));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Aviso", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Aviso";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag,
      renotify: Boolean(data.tag),
      icon: data.icon,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url === url && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
