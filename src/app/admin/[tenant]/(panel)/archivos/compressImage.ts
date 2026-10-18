// Reduce y comprime una imagen en el navegador antes de subirla (como en
// Marca): lado mayor 1600 px y como mucho 1,5 MB. PNG con transparencia se
// mantiene en PNG si cabe; si no, JPG de buena calidad.
import { MAX_IMAGE_BYTES, MAX_IMAGE_SIDE } from "@/app/lib/media";

export async function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") throw new Error(`«${file.name}» no es una imagen PNG, JPG o WebP`);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no puede procesar la imagen");
  const png = file.type === "image/png";
  if (!png) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  const toBlob = (type: string, quality?: number) =>
    new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen"))), type, quality));
  let blob = png ? await toBlob("image/png") : await toBlob("image/jpeg", 0.85);
  if (blob.size > MAX_IMAGE_BYTES) {
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    blob = await toBlob("image/jpeg", 0.82);
  }
  if (blob.size > MAX_IMAGE_BYTES) blob = await toBlob("image/jpeg", 0.7);
  if (blob.size > MAX_IMAGE_BYTES) throw new Error(`«${file.name}» sigue pesando demasiado. Prueba con una más pequeña.`);
  return { blob, width, height };
}
