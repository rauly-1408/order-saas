"use client";

import { useRef, useState } from "react";
import { ASSETS, MAX_ASSET_BYTES, type AssetKind } from "@/app/lib/brand";

// Subida de una imagen de marca. Se reduce y comprime en el navegador antes de
// enviarla (los logos en PNG para conservar la transparencia; la portada en JPG).

async function compress(file: File, kind: AssetKind): Promise<{ blob: Blob; width: number; height: number }> {
  const { maxSide, keepAlpha } = ASSETS[kind];
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no puede procesar la imagen");
  if (!keepAlpha) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  const toBlob = (type: string, quality?: number) =>
    new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen"))), type, quality));
  let blob = keepAlpha ? await toBlob("image/png") : await toBlob("image/jpeg", 0.85);
  // Un PNG enorme (foto en vez de logo): JPG de buena calidad.
  if (blob.size > MAX_ASSET_BYTES) blob = await toBlob("image/jpeg", 0.85);
  if (blob.size > MAX_ASSET_BYTES) throw new Error("La imagen sigue pesando demasiado. Prueba con una más pequeña.");
  return { blob, width, height };
}

export default function ImageField({ tenant, kind, url, onChange }: { tenant: string; kind: AssetKind; url: string | null; onChange: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const meta = ASSETS[kind];
  const api = `/api/admin/${tenant}/brand/assets/${meta.slug}`;

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      if (!file.type.startsWith("image/") || file.type === "image/svg+xml") throw new Error("Elige una imagen PNG, JPG o WebP");
      const { blob, width, height } = await compress(file, kind);
      const res = await fetch(api, { method: "PUT", headers: { "Content-Type": blob.type, "X-Image-Width": String(width), "X-Image-Height": String(height) }, body: blob });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo subir la imagen");
      onChange(json.url as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la imagen");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    const res = await fetch(api, { method: "DELETE" });
    setBusy(false);
    if (res.ok) onChange(null);
    else setError("No se pudo quitar la imagen");
  }

  const box =
    kind === "FAVICON" ? "h-16 w-16" : kind === "LOGO_SQUARE" ? "h-28 w-28" : kind === "HERO" ? "aspect-[16/7] w-full" : "h-32 w-full";

  return (
    <section className="rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
      <h3 className="text-[15px] font-semibold">{meta.title}</h3>
      <p className="mt-0.5 text-xs text-[var(--p-muted)]">{meta.help}</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label={url ? `Cambiar ${meta.title.toLowerCase()}` : `Subir ${meta.title.toLowerCase()}`}
          className={`p-press relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-[var(--p-line)] p-checker ${box} ${kind === "HERO" || kind === "LOGO" || kind === "LOGO_MONO" ? "sm:max-w-md" : ""}`}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className={`h-full w-full ${kind === "HERO" ? "object-cover" : "object-contain p-2"}`} />
          ) : (
            <span className="px-2 text-center text-xs text-[var(--p-muted)]">{busy ? "Subiendo…" : "+ Subir imagen"}</span>
          )}
          {busy && url && <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs font-medium">Subiendo…</span>}
        </button>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="p-press rounded-full border border-[var(--p-line)] px-3.5 py-1.5 text-sm font-medium hover:bg-black/[0.04] disabled:opacity-50">
            {url ? "Cambiar" : "Subir"}
          </button>
          {url && (
            <button type="button" onClick={remove} disabled={busy} className="p-press rounded-full px-3.5 py-1.5 text-sm font-medium text-[var(--p-accent)] hover:bg-[var(--p-accent-soft)] disabled:opacity-50">
              Quitar
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-[var(--p-accent)]">{error}</p>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
    </section>
  );
}
