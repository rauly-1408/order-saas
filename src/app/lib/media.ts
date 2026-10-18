// Biblioteca de archivos del restaurante (panel → Archivos): imágenes y vídeos.
// Ver docs/ARCHIVOS.md
export const MAX_IMAGE_BYTES = 1_500_000; // tras comprimir en el navegador
export const MAX_IMAGE_SIDE = 1600; // px, lado mayor
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export type MediaKind = "IMAGE" | "VIDEO";
export type MediaItem = { id: string; kind: MediaKind; name: string; mimeType: string; size: number; width: number; height: number; url: string; createdAt: string };

// URL pública de una imagen guardada en la base de datos (inmutable: el id no cambia).
export const imageUrl = (tenantSlug: string, id: string) => `/api/media/${tenantSlug}/${id}`;

// Los vídeos van a Vercel Blob: solo si el proyecto tiene el almacén conectado.
export const videoStorageEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;

// Solo se aceptan direcciones del almacén de Vercel Blob.
export function isBlobUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export const prettySize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// Foto de producto: de la biblioteca del restaurante o una dirección https.
// Devuelve null (sin foto), la dirección limpia o un mensaje de error.
export function productImageUrl(raw: unknown, tenantSlug: string): { value: string | null } | { error: string } {
  if (raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) return { value: null };
  if (typeof raw !== "string") return { error: "Imagen no válida" };
  const v = raw.trim();
  if (v.startsWith(`/api/media/${tenantSlug}/`) && /^\/api\/media\/[a-z0-9-]+\/[a-z0-9]+$/i.test(v)) return { value: v };
  try {
    const u = new URL(v);
    if (u.protocol === "https:" && v.length <= 1000) return { value: u.toString() };
  } catch {}
  return { error: "La imagen tiene que ser de tus archivos o una dirección https" };
}
