"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
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
  const [toDelete, setToDelete] = useState<Item[] | null>(null); // ventana «¿Borrar…?»
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState("");
  // Ventanas y avisos van en un portal en `.panel`: la animación de entrada de la
  // página encierra los elementos `fixed` (ver docs/ARCHIVOS.md).
  const portal = useSyncExternalStore(
    () => () => {},
    () => (document.querySelector(".panel") as HTMLElement | null) ?? document.body,
    () => null
  );
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

  // Borrar: primero la ventana «¿Borrar…?»; la API borra de uno en uno.
  const remove = (f: Item) => setToDelete([f]);
  const removeSelected = () => {
    const items = (files ?? []).filter((f) => selected.has(f.id));
    if (items.length) setToDelete(items);
  };
  async function doDelete() {
    if (!toDelete || deleting) return;
    setDeleting(true);
    setError("");
    const failed: string[] = [];
    for (const f of toDelete) {
      const res = await fetch(`${api}?id=${encodeURIComponent(f.id)}`, { method: "DELETE" });
      if (!res.ok) failed.push(f.name);
    }
    const okIds = new Set(toDelete.filter((f) => !failed.includes(f.name)).map((f) => f.id));
    setFiles((fs) => fs?.filter((x) => !okIds.has(x.id)) ?? null);
    setSelected((sel) => new Set([...sel].filter((id) => !okIds.has(id))));
    if (failed.length) setError(`No se pudo borrar: ${failed.join(", ")}`);
    else flash(okIds.size === 1 ? "Archivo borrado" : `${okIds.size} archivos borrados`);
    setDeleting(false);
    setToDelete(null);
    setPreview(null);
  }
  const flash = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(""), 1800);
  };

  async function copy(f: Item) {
    const url = f.url.startsWith("/") ? `${location.origin}${f.url}` : f.url;
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(f.id);
    setTimeout(() => setCopied(""), 1500);
    flash("Enlace copiado");
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
              <button type="button" onClick={removeSelected} className="p-press flex items-center gap-1.5 rounded-full bg-[var(--p-accent)] px-3 py-1 text-xs font-semibold text-white">
                <TrashIcon /> Borrar
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
                    className="h-5 w-5 accent-[var(--p-brand)]"
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
                        className="h-5 w-5 accent-[var(--p-brand)]"
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
                        <button type="button" onClick={() => copy(f)} title={copied === f.id ? "Enlace copiado" : "Copiar enlace"} aria-label={`Copiar el enlace de ${f.name}`} className={`p-press flex h-8 w-8 items-center justify-center rounded-full ${copied === f.id ? "bg-emerald-50 text-emerald-700" : "text-[var(--p-muted)] hover:bg-black/[0.05] hover:text-[var(--p-ink)]"}`}>
                          {copied === f.id ? <CheckIcon /> : <LinkIcon />}
                        </button>
                        <button type="button" onClick={() => remove(f)} title="Borrar" aria-label={`Borrar ${f.name}`} className="p-press flex h-8 w-8 items-center justify-center rounded-full text-[var(--p-muted)] hover:bg-[var(--p-accent-soft)] hover:text-[var(--p-accent)]">
                          <TrashIcon />
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
      {portal &&
        createPortal(
          <>
      {/* Ventana «¿Borrar…?»: nombre, en qué productos se usa y que no se puede deshacer */}
      {toDelete && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center" role="alertdialog" aria-modal="true" aria-labelledby="borrar-titulo" onClick={() => !deleting && setToDelete(null)}>
          <div className="w-full max-w-md rounded-[24px] bg-[var(--p-surface)] p-5 text-[var(--p-ink)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--p-accent-soft)] text-[var(--p-accent)]">
                <TrashIcon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="borrar-titulo" className="text-lg font-semibold">
                  {toDelete.length === 1 ? `¿Borrar «${toDelete[0].name}»?` : `¿Borrar ${toDelete.length} archivos?`}
                </h2>
                <p className="mt-1 text-sm text-[var(--p-muted)]">
                  {toDelete.length === 1 ? "Desaparecerá de tu biblioteca." : "Desaparecerán de tu biblioteca."} No se puede deshacer.
                </p>
                {(() => {
                  const used = toDelete.filter((f) => f.usedBy?.length);
                  if (!used.length) return null;
                  const names = [...new Set(used.flatMap((f) => f.usedBy ?? []))];
                  return (
                    <p className="mt-3 rounded-xl bg-[var(--p-accent-soft)] px-3 py-2 text-sm text-[var(--p-accent)]">
                      {used.length === 1 && toDelete.length === 1 ? "Esta imagen se usa" : `${used.length === 1 ? "Una de ellas se usa" : `${used.length} de ellas se usan`}`} en {names.length === 1 ? "el producto" : "los productos"} <b>{names.join(", ")}</b>, que {names.length === 1 ? "se quedará" : "se quedarán"} sin foto.
                    </p>
                  );
                })()}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setToDelete(null)} disabled={deleting} className="rounded-full border border-[var(--p-line)] px-4 py-2.5 text-sm font-medium disabled:opacity-50">
                Cancelar
              </button>
              <button type="button" onClick={doDelete} disabled={deleting} className="p-press rounded-full bg-[var(--p-accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {deleting ? "Borrando…" : toDelete.length === 1 ? "Sí, borrar" : `Sí, borrar ${toDelete.length}`}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Aviso breve: «Enlace copiado», «Archivo borrado» */}
      {toast && (
        <div role="status" className="p-rise pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center">
          <span className="rounded-full bg-[var(--p-ink)] px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</span>
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
              <button type="button" onClick={() => copy(preview)} className="p-press flex items-center gap-1.5 rounded-full border border-[var(--p-line)] px-2.5 py-1 text-[11px] font-medium whitespace-nowrap">
                {copied === preview.id ? <CheckIcon /> : <LinkIcon />} {copied === preview.id ? "Copiado" : "Copiar enlace"}
              </button>
              <button type="button" onClick={() => remove(preview)} className="p-press flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--p-accent)] hover:bg-[var(--p-accent-soft)]">
                <TrashIcon /> Borrar
              </button>
              <button type="button" onClick={() => setPreview(null)} className="rounded-full px-3 py-1 text-xs text-[var(--p-muted)] hover:bg-black/[0.05]">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
          </>,
          portal
        )}
    </div>
  );
}

function LinkIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </svg>
  );
}
function TrashIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
    </svg>
  );
}
function CheckIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
