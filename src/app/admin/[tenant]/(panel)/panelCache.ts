// Memoria de datos del panel entre pestañas (solo en el navegador).
// Al volver a una pestaña se pinta al instante lo último que se cargó y se
// actualiza por detrás, en vez de mostrar "Cargando…" cada vez.
const cache = new Map<string, unknown>();

export function readPanelCache<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function writePanelCache<T>(key: string, data: T): void {
  cache.set(key, data);
}
