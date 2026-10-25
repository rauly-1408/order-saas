"use client";

// Cola sin conexión del panel. Si se cae internet al mandar una ronda o una
// venta de Caja, se guarda en este aparato (localStorage) y se reenvía sola al
// volver la conexión, en orden. Cada envío lleva un `requestId`: si llega dos
// veces, el servidor no lo duplica. Ver docs/SIN-CONEXION.md

export type Pending = { id: string; url: string; body: Record<string, unknown>; label: string; at: number; error?: string };
export type Sent<T> = { queued: false; data: T } | { queued: true; id: string };

const KEY = "panel-outbox-v1";
export const OUTBOX_SENT = "panel-outbox-sent"; // evento de window al vaciar parte de la cola
const listeners = new Set<() => void>();
let flushing: Promise<number> | null = null;

function read(): Pending[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write(list: Pending[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Sin almacenamiento: no hay cola, pero no se rompe nada.
  }
  listeners.forEach((l) => l());
}

export function pendingList(): Pending[] {
  return typeof window === "undefined" ? [] : read();
}
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => e.key === KEY && fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}
export function discard(id: string) {
  write(read().filter((p) => p.id !== id));
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);

// Sin red, o el servidor no responde (Vercel caído, router reiniciando).
const unreachable = (res: Response | null) => !res || res.status === 502 || res.status === 503 || res.status === 504;

async function attempt(url: string, body: Record<string, unknown>): Promise<Response | null> {
  try {
    return await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (err) {
    if (err instanceof TypeError) return null; // fallo de red
    throw err;
  }
}

// Envía; si no hay conexión, lo deja en la cola y devuelve { queued: true }.
// Un error del servidor (mesa ya cobrada, producto agotado…) se lanza como siempre.
export async function sendOrQueue<T>(url: string, body: Record<string, unknown>, label: string): Promise<Sent<T>> {
  const id = newId();
  const withId = { ...body, requestId: id };
  // Con envíos aún en cola, este va detrás para no adelantarlos (ronda 2 tras la 1).
  const behind = read().some((p) => !p.error);
  const res = navigator.onLine === false || behind ? null : await attempt(url, withId);
  if (unreachable(res)) {
    write([...read(), { id, url, body: withId, label, at: Date.now() }]);
    void flush();
    return { queued: true, id };
  }
  const json = await res!.json().catch(() => ({}));
  if (!res!.ok) throw new Error((json as { error?: string }).error ?? "No se ha podido hacer. Inténtalo de nuevo.");
  return { queued: false, data: json as T };
}

// Reenvía la cola en orden. Para en el primer fallo de red; un rechazo del
// servidor se queda marcado para que alguien lo revise (no bloquea al resto).
// Si ya hay un reenvío en marcha, espera a que acabe y vuelve a mirar la cola.
export async function flush(): Promise<number> {
  while (flushing) await flushing.catch(() => 0);
  if (navigator.onLine === false) return 0;
  flushing = flushOnce();
  try {
    return await flushing;
  } finally {
    flushing = null;
  }
}

async function flushOnce(): Promise<number> {
  let sent = 0;
  for (;;) {
    const p = read().find((x) => !x.error);
    if (!p) break;
    const res = await attempt(p.url, p.body).catch(() => null);
    if (unreachable(res) || res!.status === 401) break; // sin red, o sesión caducada: espera a que vuelvan a entrar
    if (res!.ok) {
      discard(p.id);
      sent++;
      continue;
    }
    const error = ((await res!.json().catch(() => ({}))) as { error?: string }).error ?? "No se ha podido enviar";
    if (/procesando/i.test(error)) break; // el mismo envío aún en curso: siguiente vuelta
    write(read().map((x) => (x.id === p.id ? { ...x, error } : x)));
  }
  return sent;
}

// Copia local de datos que hacen falta sin conexión (la carta, el plano).
export function saveLocal(key: string, data: unknown) {
  try {
    localStorage.setItem(`panel-cache:${key}`, JSON.stringify(data));
  } catch {
    // lleno o bloqueado: solo se pierde la copia
  }
}
export function loadLocal<T>(key: string): T | undefined {
  try {
    const v = localStorage.getItem(`panel-cache:${key}`);
    return v ? (JSON.parse(v) as T) : undefined;
  } catch {
    return undefined;
  }
}
