// Logo del restaurante para los tickets: el «Logotipo en blanco y negro» de
// Personalización (si no hay, el principal), pasado a puntos blanco/negro del
// ancho del papel. Se guarda en memoria mientras no cambie el logo.
// Ver docs/IMPRESION.md
import sharp from "sharp";
import { prisma } from "@/app/lib/prisma";

export type Raster = { width: number; height: number; data: Uint8Array }; // 1 bit por punto, filas de ceil(width/8) bytes

// Puntos por línea de cada papel: 80 mm = 576 (48 caracteres), 72 mm = 512 (42), 58 mm = 384 (32).
const DOTS: Record<number, number> = { 48: 576, 42: 512, 32: 384 };
const MAX_HEIGHT = 140; // ≈ 1,8 cm: que el logo no se coma medio ticket

const cache = new Map<string, Raster | null>();

export async function receiptLogo(tenantId: string, widthChars: number): Promise<Raster | null> {
  const assets = await prisma.brandAsset.findMany({ where: { tenantId, kind: { in: ["LOGO_MONO", "LOGO"] } }, select: { kind: true, updatedAt: true } });
  const pick = assets.find((a) => a.kind === "LOGO_MONO") ?? assets.find((a) => a.kind === "LOGO");
  if (!pick) return null;
  const key = `${tenantId}:${pick.kind}:${pick.updatedAt.getTime()}:${widthChars}`;
  if (cache.has(key)) return cache.get(key)!;
  const asset = await prisma.brandAsset.findUnique({ where: { tenantId_kind: { tenantId, kind: pick.kind } }, select: { data: true } });
  let raster: Raster | null = null;
  try {
    raster = asset ? await toRaster(Buffer.from(asset.data), Math.round((DOTS[widthChars] ?? 576) * 0.7)) : null;
  } catch (e) {
    console.error("[receiptLogo]", e); // un logo que no se puede leer no impide imprimir
  }
  cache.set(key, raster);
  return raster;
}

// Fondo blanco, escala de grises y umbral: lo oscuro (o de color) sale negro.
export async function toRaster(image: Buffer, maxWidth: number): Promise<Raster | null> {
  const { data, info } = await sharp(image)
    .flatten({ background: "#ffffff" })
    .grayscale()
    .trim({ threshold: 10 })
    .resize({ width: maxWidth, height: MAX_HEIGHT, fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (!width || !height) return null;
  const row = Math.ceil(width / 8);
  const bits = new Uint8Array(row * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) if (data[(y * width + x) * channels] < 170) bits[y * row + (x >> 3)] |= 0x80 >> (x & 7);
  return { width, height, data: bits };
}

// Para la vista previa: los puntos de la impresora otra vez a PNG (negro sobre blanco).
export async function rasterPng(width: number, height: number, bits: Uint8Array): Promise<string> {
  const row = Math.ceil(width / 8);
  const px = Buffer.alloc(width * height, 255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (bits[y * row + (x >> 3)] & (0x80 >> (x & 7))) px[y * width + x] = 0;
  const png = await sharp(px, { raw: { width, height, channels: 1 } }).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}
