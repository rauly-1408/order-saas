"use client";

// Código de colaborador en la tienda: el enlace de un colaborador (RRPP, hotel…)
// lleva ?c=CODIGO. Se guarda en el aparato 30 días y se manda con el pedido,
// para que el colaborador se lleve su parte. Ver docs/COLABORADORES.md

export type Collab = { code: string; name: string; discountPct?: number };
const DAYS = 30;
const key = (tenant: string) => `collab:${tenant}`;

export function loadCollab(tenant: string): Collab | null {
  try {
    const v = JSON.parse(localStorage.getItem(key(tenant)) ?? "null") as (Collab & { at: number }) | null;
    if (!v || Date.now() - v.at > DAYS * 86_400_000) return null;
    return { code: v.code, name: v.name, discountPct: v.discountPct ?? 0 };
  } catch {
    return null;
  }
}
export function saveCollab(tenant: string, c: Collab | null) {
  try {
    if (c) localStorage.setItem(key(tenant), JSON.stringify({ ...c, at: Date.now() }));
    else localStorage.removeItem(key(tenant));
  } catch {
    // sin almacenamiento: el código vale solo mientras esté abierta la página
  }
}

// ¿Existe ese código? Devuelve el colaborador o null.
export async function checkCollab(tenant: string, code: string): Promise<Collab | null> {
  const res = await fetch(`/api/collaborators/${tenant}?code=${encodeURIComponent(code)}`).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json()) as Collab;
}

// Si se ha entrado con ?c=CODIGO, lo comprueba y lo guarda.
export async function captureCollabFromUrl(tenant: string): Promise<Collab | null> {
  const code = new URLSearchParams(window.location.search).get("c");
  if (!code) return loadCollab(tenant);
  const c = await checkCollab(tenant, code);
  if (c) saveCollab(tenant, c);
  return c ?? loadCollab(tenant);
}
