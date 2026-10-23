"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { MAX_VIDEO_BYTES, VIDEO_TYPES, prettySize, type MediaItem, type MediaKind } from "@/app/lib/media";
import { compressImage } from "./compressImage";

// Biblioteca de archivos del restaurante: subir (botón o arrastrando), buscar,
// copiar el enlace y borrar. Con onPick sirve de selector (fotos de productos).
// Ver docs/ARCHIVOS.md

type Item = MediaItem & { usedBy?: string[] };
type Uploading = { name: string; pct: number };
type SortKey = "createdAt" | "name" | "size";
const PAGE = 50;
const TYPE_LABEL: Record<string, string> = { "image/png": "PNG", "image/jpeg": "JPG", "image/webp": "WebP", "video/mp4": "MP4", "video/webm": "WebM", "video/quicktime": "MOV" };
const dateLabel = (iso: string) => {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.toLocaleDateString("es-ES", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })} a las ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
};

export default function MediaLibrary({ tenant, kind, onPick, pickedUrl }: { tenant: string; kind: MediaKind; onPick?: (item: Item) => void; pickedUrl?: string | null }) {
  const api = `/api/admin/${tenant}/media`;
  const [files, setFiles] = useState<Item[] | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState("");
  // Lista (página Archivos): orden, página y selección para borrar varios.
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Item | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const isImage = kind === "IMAGE";

  const load = useCallback(async () => {
    const res = await fetch(`${api}?kind=${kind}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "No se pudieron cargar los archivos");
    setFiles(json.files);
    setVideoEnabled(json.videoEnabled);
  }, [api, kind]);

  useEffect(() => {
    let alive = true;
    fetch(`${api}?kind=${kind}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("No se pudieron cargar los archivos"))))
      .then((json) => {
        if (!alive) return;
        setFiles(json.files);
        setVideoEnabled(json.videoEnabled);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "No se pudieron cargar los archivos"));
    return () => {
      alive = false;
    };
  }, [api, kind]);

  async function uploadOne(file: File, i: number, setPct: (i: number, pct: number) => void) {
    if (isImage) {
      const { blob, width, height } = await compressImage(file);
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": blob.type, "X-File-Name": encodeURIComponent(file.name), "X-Image-Width": String(width), "X-Image-Height": String(height) },
        body: blob,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `No se pudo subir «${file.name}»`);
      setPct(i, 100);
      return json.file as Item;
    }
    if (!VIDEO_TYPES.includes(file.type)) throw new Error(`«${file.name}» no es un vídeo MP4, WebM o MOV`);
    if (file.size > MAX_VIDEO_BYTES) throw new Error(`«${file.name}» pesa más de 200 MB`);
    const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "") || "video.mp4";
    // Directo del navegador a Vercel Blob (el servidor solo da el permiso).
    const blob = await upload(`tenants/${tenant}/videos/${safe}`, file, {
      access: "public",
      handleUploadUrl: `${api}/video`,
      contentType: file.type,
      multipart: file.size > 20 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => setPct(i, Math.round(percentage)),
    });
    const res = await fetch(`${api}/video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "register", url: blob.url, pathname: blob.pathname, name: file.name, size: file.size, mimeType: file.type }),
    });
    if (!res.ok) throw new Error(`No se pudo guardar «${file.name}»`);
    return null;
  }

  async function handleFiles(list: FileList | File[]) {
    const chosen = [...list].slice(0, 20);
    if (!chosen.length) return;
    setError("");
    setUploading(chosen.map((f) => ({ name: f.name, pct: 0 })));
    const setPct = (i: number, pct: number) => setUploading((u) => u.map((x, j) => (j === i ? { ...x, pct } : x)));
    let last: Item | null = null;
    for (let i = 0; i < chosen.length; i++) {
      try {
        last = (await uploadOne(chosen[i], i, setPct)) ?? last;
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo subir el archivo");
      }
    }
    setUploading([]);
    if (input.current) input.current.value = "";
    await load().catch(() => {});
    // En el selector, una sola imagen subida se elige directamente.
    if (onPick && last && chosen.length === 1) onPick(last);
  }

  async function remove(f: Item) {
    const warn = f.usedBy?.length ? `\n\nSe usa en: ${f.usedBy.join(", ")}. Esos productos se quedarán sin foto.` : "";
    if (!confirm(`¿Borrar «${f.name}»? No se puede deshacer.${warn}`)) return;
    const res = await fetch(`${api}?id=${encodeURIComponent(f.id)}`, { method: "DELETE" });
    if (!res.ok) return setError("No se pudo borrar el archivo");
    setFiles((fs) => fs?.filter((x) => x.id !== f.id) ?? null);
    setSelected((sel) => {
      const n = new Set(sel);
      n.delete(f.id);
      return n;
    });
  }

  // Borrar los seleccionados, uno a uno (la API borra de uno en uno).
  async function removeSelected() {
    const items = (files ?? []).filter((f) => selected.has(f.id));
    if (!items.length) return;
    const used = items.filter((f) => f.usedBy?.length);
    const warn = used.length ? `\n\n${used.length === 1 ? "Uno se usa" : `${used.length} se usan`} en productos, que se quedarán sin foto.` : "";
    if (!confirm(`¿Borrar ${items.length === 1 ? "este archivo" : `estos ${items.length} archivos`}? No se puede deshacer.${warn}`)) return;
    setError("");
    const failed: string[] = [];
    for (const f of items) {
      const res = await fetch(`${api}?id=${encodeURIComponent(f.id)}`, { method: "DELETE" });
      if (!res.ok) failed.push(f.name);
    }
    if (failed.length) setError(`No se pudo borrar: ${failed.join(", ")}`);
    setSelected(new Set());
    await load().catch(() => {});
  }

  async function copy(f: Item) {
    const url = f.url.startsWith("/") ? `${location.origin}${f.url}` : f.url;
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(f.id);
    setTimeout(() => setCopied(""), 1500);
  }

  if (!isImage && !videoEnabled) {
    return (
      <div className="rounded-2xl bg-[var(--p-surface)] p-5 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <p className="font-semibold">🎬 Los vídeos todavía no están activados</p>
        <p className="mt-1 text-[var(--p-muted)]">
          Los vídeos pesan mucho y se guardan en el almacén de archivos de Vercel. Hay que activarlo una vez en el proyecto (lo hace quien gestiona la plataforma). Mientras tanto, puedes subir imágenes.
        </p>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const shown = (files ?? []).filter((f) => !q || f.name.toLowerCase().includes(q));
  const sorted = [...shown].sort((a, b) => {
    const m = sort.dir === "asc" ? 1 : -1;
    if (sort.key === "name") return a.name.localeCompare(b.name, "es") * m;
    if (sort.key === "size") return (a.size - b.size) * m;
    return a.createdAt.localeCompare(b.createdAt) * m;
  });
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const current = Math.min(page, pages - 1);
  const pageItems = sorted.slice(current * PAGE, current * PAGE + PAGE);
  const allOnPage = pageItems.length > 0 && pageItems.every((f) => selected.has(f.id));
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  const sortMark = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : "");
  const th = "px-3 py-2.5 text-left text-xs font-medium text-[var(--p-muted)]";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`rounded-2xl transition-colors ${dragging ? "bg-[var(--p-brand-soft)] ring-2 ring-[var(--p-brand)]" : ""}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={isImage ? "Buscar imágenes…" : "Buscar vídeos…"} aria-label="Buscar" className="w-full rounded-lg px-3 py-2 text-sm sm:max-w-xs" />
        <div className="flex-1 text-xs text-[var(--p-muted)]">{isImage ? "PNG, JPG o WebP. Se reducen solas a 1600 px." : "MP4, WebM o MOV, hasta 200 MB."} También puedes arrastrarlos aquí.</div>
        <button type="button" onClick={() => input.current?.click()} disabled={uploading.length > 0} className="p-press rounded-full bg-[var(--p-brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {uploading.length ? "Subiendo…" : isImage ? "⬆ Subir imágenes" : "⬆ Subir vídeos"}
        </button>
        <input ref={input} type="file" multiple accept={isImage ? "image/png,image/jpeg,image/webp" : VIDEO_TYPES.join(",")} className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
      </div>

      {uploading.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-live="polite">
          {uploading.map((u, i) => (
            <li key={i} className="text-xs">
              <span className="text-[var(--p-muted)]">{u.name}</span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                <span className="block h-full rounded-full bg-[var(--p-brand)] transition-[width]" style={{ width: `${Math.max(u.pct, 4)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 text-sm text-[var(--p-accent)]">{error}</p>}

      {!files ? (
        <p className="py-10 text-center text-sm text-[var(--p-muted)]">Cargando…</p>
      ) : shown.length === 0 ? (
        <div className="mt-4 rounded-2xl border-2 border-dashed border-[var(--p-line)] py-12 text-center text-sm text-[var(--p-muted)]">
          {files.length === 0 ? (isImage ? "Todavía no has subido imágenes. Arrástralas aquí o pulsa «Subir imágenes»." : "Todavía no has subido vídeos.") : `Nada coincide con «${query}».`}
        </div>
      ) : onPick ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((f) => {
            const picked = !!pickedUrl && pickedUrl === f.url;
            return (
              <li key={f.id} className={`overflow-hidden rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${picked ? "ring-2 ring-[var(--p-brand)]" : ""}`}>
                <button type="button" onClick={() => onPick?.(f)} className="block aspect-square w-full bg-black/[0.04]" aria-label={`Elegir ${f.name}`}>
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.url} alt={f.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <video src={f.url} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                  )}
                </button>
                <div className="p-2.5">
                  <p className="truncate text-xs font-medium" title={f.name}>
                    {f.name}
                  </p>
                  <p className="text-[11px] text-[var(--p-muted)]">
                    {prettySize(f.size)}
                    {f.width ? ` · ${f.width}×${f.height}` : ""}
                    {f.usedBy?.length ? ` · en ${f.usedBy.length} ${f.usedBy.length === 1 ? "producto" : "productos"}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {/* Barra de selección: aparece al marcar archivos */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-b border-[var(--p-line)] bg-[var(--p-brand-soft)] px-4 py-2 text-sm">
              <span className="font-semibold">{selected.size} {selected.size === 1 ? "seleccionado" : "seleccionados"}</span>
              <button type="button" onClick={removeSelected} className="p-press rounded-full bg-[var(--p-accent)] px-3 py-1 text-xs font-semibold text-white">
                Borrar
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="rounded-full px-3 py-1 text-xs font-medium text-[var(--p-muted)] hover:bg-black/[0.05]">
                Quitar selección
              </button>
            </div>
          )}
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--p-line)]">
                <th scope="col" className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allOnPage}
                    onChange={(e) =>
                      setSelected((sel) => {
                        const n = new Set(sel);
                        pageItems.forEach((f) => (e.target.checked ? n.add(f.id) : n.delete(f.id)));
                        return n;
                      })
                    }
                    aria-label="Seleccionar todos los de esta página"
                    className="h-4 w-4 accent-[var(--p-brand)]"
                  />
                </th>
                <th scope="col" className={th}>
                  <button type="button" onClick={() => toggleSort("name")} className="hover:text-[var(--p-ink)]">
                    Nombre del archivo{sortMark("name")}
                  </button>
                </th>
                <th scope="col" className={`${th} hidden w-44 md:table-cell`}>
                  <button type="button" onClick={() => toggleSort("createdAt")} className="hover:text-[var(--p-ink)]">
                    Fecha de adición{sortMark("createdAt")}
                  </button>
                </th>
                <th scope="col" className={`${th} hidden w-24 text-right sm:table-cell`}>
                  <button type="button" onClick={() => toggleSort("size")} className="hover:text-[var(--p-ink)]">
                    Tamaño{sortMark("size")}
                  </button>
                </th>
                <th scope="col" className={`${th} hidden w-32 lg:table-cell`}>
                  Referencias
                </th>
                <th scope="col" className="hidden w-40 px-3 py-2.5 sm:table-cell">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((f) => {
                const checked = selected.has(f.id);
                const refs = f.usedBy?.length ?? 0;
                return (
                  <tr key={f.id} className={`border-b border-[var(--p-line)] last:border-0 ${checked ? "bg-[var(--p-brand-soft)]/60" : "hover:bg-black/[0.02]"}`}>
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setSelected((sel) => {
                            const n = new Set(sel);
                            if (e.target.checked) n.add(f.id);
                            else n.delete(f.id);
                            return n;
                          })
                        }
                        aria-label={`Seleccionar ${f.name}`}
                        className="h-4 w-4 accent-[var(--p-brand)]"
                      />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <button type="button" onClick={() => setPreview(f)} className="flex min-w-0 w-full items-center gap-3 text-left" aria-label={`Ver ${f.name}`}>
                        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-black/[0.05]">
                          {isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <video src={f.url} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-[var(--p-ink)]" title={f.name}>
                            {f.name}
                          </span>
                          <span className="block text-xs text-[var(--p-muted)]">
                            {TYPE_LABEL[f.mimeType] ?? f.mimeType}
                            {f.width ? ` · ${f.width}×${f.height}` : ""}
                            <span className="sm:hidden"> · {prettySize(f.size)}</span>
                            {refs > 0 && <span className="lg:hidden"> · en {refs} {refs === 1 ? "producto" : "productos"}</span>}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="hidden px-3 py-2 align-middle text-[var(--p-muted)] md:table-cell">{dateLabel(f.createdAt)}</td>
                    <td className="hidden px-3 py-2 text-right align-middle tabular-nums text-[var(--p-muted)] sm:table-cell">{prettySize(f.size)}</td>
                    <td className="hidden px-3 py-2 align-middle text-[var(--p-muted)] lg:table-cell">{refs > 0 ? `${refs} ${refs === 1 ? "producto" : "productos"}` : "—"}</td>
                    {/* En el móvil las acciones van en la vista previa (tocar el archivo) */}
                    <td className="hidden px-3 py-2 text-right align-middle sm:table-cell">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => copy(f)} className="p-press rounded-full border border-[var(--p-line)] px-2.5 py-1 text-[11px] font-medium whitespace-nowrap">
                          {copied === f.id ? "✓ Copiado" : "Copiar enlace"}
                        </button>
                        <button type="button" onClick={() => remove(f)} className="p-press rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--p-accent)]">
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Paginación: 50 por página, como Shopify */}
          <div className="flex items-center justify-between border-t border-[var(--p-line)] px-4 py-2 text-xs text-[var(--p-muted)]">
            <span>
              {sorted.length === 0 ? "0" : `${current * PAGE + 1}-${Math.min(sorted.length, (current + 1) * PAGE)}`} de {sorted.length}
            </span>
            {pages > 1 && (
              <span className="flex gap-1">
                <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={current === 0} aria-label="Página anterior" className="rounded-full border border-[var(--p-line)] px-2.5 py-1 disabled:opacity-40">
                  ‹
                </button>
                <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={current >= pages - 1} aria-label="Página siguiente" className="rounded-full border border-[var(--p-line)] px-2.5 py-1 disabled:opacity-40">
                  ›
                </button>
              </span>
            )}
          </div>
        </div>
      )}
      {/* Vista previa a tamaño completo */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={preview.name} onClick={() => setPreview(null)}>
          <div className="max-h-full max-w-4xl overflow-hidden rounded-2xl bg-[var(--p-surface)]" onClick={(e) => e.stopPropagation()}>
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt={preview.name} className="max-h-[80vh] w-auto max-w-full object-contain" />
            ) : (
              <video src={preview.url} controls autoPlay className="max-h-[80vh] w-auto max-w-full" />
            )}
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium" title={preview.name}>
                {preview.name}
              </span>
              <button type="button" onClick={() => copy(preview)} className="p-press rounded-full border border-[var(--p-line)] px-2.5 py-1 text-[11px] font-medium whitespace-nowrap">
                {copied === preview.id ? "✓ Copiado" : "Copiar enlace"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = preview;
                  setPreview(null);
                  await remove(target);
                }}
                className="p-press rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--p-accent)]"
              >
                Borrar
              </button>
              <button type="button" onClick={() => setPreview(null)} className="rounded-full px-3 py-1 text-xs text-[var(--p-muted)] hover:bg-black/[0.05]">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
