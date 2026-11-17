// Ticket del cliente dibujado como imagen (como el de Last.app): letra Inter,
// barra negra «Productos», cuadro de IVA y total grande. Se dibuja con la misma
// herramienta que los iconos (next/og) y se pasa a puntos blanco/negro para la
// impresora. Los datos los prepara lib/printing.ts (receiptModel).
// Ver docs/IMPRESION.md
import { readFile } from "fs/promises";
import path from "path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import type { Raster } from "@/app/lib/printLogo";

export type ReceiptModel = {
  logo: string | null; // PNG (data URL) del logo; sin logo, el nombre en grande
  name: string; // nombre comercial
  legal: string[]; // razón social, NIF, dirección… (líneas cortas)
  date: string;
  docTitle: string; // «Factura simplificada», «Factura proforma», «Ticket»
  docNumber: string | null;
  info: [string, string][]; // pares «Mesa: 6», «Comensales: 1»… (de dos en dos por fila; sin etiqueta, solo el valor)
  extraInfo: string[]; // cliente, dirección de entrega…
  items: { qty: number; name: string; price: string; detail: string[] }[];
  extras: [string, string][]; // envío, descuento, propina…
  tax: { label: string; base: string; tax: string; total: string } | null;
  total: string;
  payment: [string, string][];
  pending: string | null;
  qr: string | null; // PNG (data URL) del QR de la factura
  verifactu: boolean;
  thanks: string;
};

let fonts: { name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" }[] | null = null;
async function loadFonts() {
  if (fonts) return fonts;
  const dir = path.join(process.cwd(), "src/app/lib/fonts");
  const [r, s, b] = await Promise.all([400, 600, 700].map((w) => readFile(path.join(dir, `inter-${w}.woff`))));
  fonts = [
    { name: "Inter", data: r, weight: 400, style: "normal" },
    { name: "Inter", data: s, weight: 600, style: "normal" },
    { name: "Inter", data: b, weight: 700, style: "normal" },
  ];
  return fonts;
}

// Puntos por línea de cada papel: 80 mm = 576, 72 mm = 512, 58 mm = 384.
export const PAPER_DOTS: Record<number, number> = { 48: 576, 42: 512, 32: 384 };

export async function receiptImage(m: ReceiptModel, widthChars: number): Promise<Raster> {
  const W = PAPER_DOTS[widthChars] ?? 576;
  const f = W / 576; // todo se escala con el papel
  const px = (n: number) => Math.round(n * f);
  const base = px(24);
  const small = px(19);
  const row = { display: "flex", justifyContent: "space-between", width: "100%" } as const;
  // Alto de sobra: luego se recorta el blanco de abajo.
  const H = px(1400) + m.items.reduce((a, i) => a + px(40) + i.detail.length * px(26), 0) + (m.qr ? px(320) : 0) + (m.logo ? px(170) : 0);

  const img = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: "#fff", color: "#000", fontFamily: "Inter", fontSize: base, padding: `${px(8)}px ${px(10)}px` }}>
        {/* Cabecera */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", width: "100%" }}>
          {m.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.logo} alt="" style={{ maxWidth: px(480), maxHeight: px(150), objectFit: "contain", marginBottom: px(14) }} />
          ) : (
            <div style={{ fontSize: px(44), fontWeight: 700, marginBottom: px(8) }}>{m.name}</div>
          )}
          {m.logo && <div style={{ fontWeight: 700, fontSize: px(25) }}>{m.name}</div>}
          {m.legal.map((l, i) => (
            <div key={i} style={{ marginTop: px(4), fontSize: px(22) }}>
              {l}
            </div>
          ))}
          <div style={{ marginTop: px(14), fontSize: px(22) }}>{m.date}</div>
        </div>

        {/* Documento y datos del pedido */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: px(18), width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
            <span>{m.docTitle}</span>
            {m.docNumber && <span style={{ fontWeight: 600 }}>{m.docNumber}</span>}
          </div>
          {Array.from({ length: Math.ceil(m.info.length / 2) }, (_, r) => m.info.slice(r * 2, r * 2 + 2)).map((pair, i) => (
            <div key={i} style={{ ...row, marginTop: px(8) }}>
              {pair.map(([k, v]) => (
                <span key={k + v} style={{ display: "flex" }}>
                  {k && <span style={{ fontWeight: 700, marginRight: px(8) }}>{k}:</span>}
                  <span>{v}</span>
                </span>
              ))}
            </div>
          ))}
          {m.extraInfo.map((l, i) => (
            <div key={i} style={{ marginTop: px(6), fontSize: px(21) }}>
              {l}
            </div>
          ))}
        </div>

        {/* Productos */}
        <div style={{ display: "flex", marginTop: px(18), background: "#000", color: "#fff", fontWeight: 700, fontSize: px(26), padding: `${px(12)}px ${px(18)}px`, width: "100%" }}>Productos</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: px(10), width: "100%" }}>
          {m.items.map((it, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", marginTop: px(8), width: "100%" }}>
              <div style={row}>
                <span style={{ display: "flex", maxWidth: "78%" }}>
                  <span style={{ fontWeight: 700, width: px(64), flexShrink: 0 }}>{it.qty}x</span>
                  <span>{it.name}</span>
                </span>
                <span>{it.price}</span>
              </div>
              {it.detail.map((d, j) => (
                <div key={j} style={{ fontSize: small, marginLeft: px(64), marginTop: px(3) }}>
                  {d}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", borderTop: `${Math.max(1, px(2))}px dashed #000`, marginTop: px(20), width: "100%" }} />

        {/* Extras, IVA y total */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: px(12), width: "100%" }}>
          {m.extras.map(([k, v]) => (
            <div key={k} style={{ ...row, marginTop: px(6) }}>
              <span>{k}</span>
              <span>{v}</span>
            </div>
          ))}
          {m.tax && (
            <div style={{ display: "flex", flexDirection: "column", marginTop: px(10), width: "100%" }}>
              <div style={{ display: "flex", fontSize: small, width: "100%" }}>
                <span style={{ width: "34%" }} />
                <span style={{ width: "24%", textAlign: "right", justifyContent: "flex-end", display: "flex" }}>Base</span>
                <span style={{ width: "18%", textAlign: "right", justifyContent: "flex-end", display: "flex" }}>IVA</span>
                <span style={{ width: "24%", textAlign: "right", justifyContent: "flex-end", display: "flex" }}>Total</span>
              </div>
              <div style={{ display: "flex", marginTop: px(4), width: "100%" }}>
                <span style={{ width: "34%" }}>{m.tax.label}</span>
                <span style={{ width: "24%", justifyContent: "flex-end", display: "flex" }}>{m.tax.base}</span>
                <span style={{ width: "18%", justifyContent: "flex-end", display: "flex" }}>{m.tax.tax}</span>
                <span style={{ width: "24%", justifyContent: "flex-end", display: "flex" }}>{m.tax.total}</span>
              </div>
            </div>
          )}
          <div style={{ ...row, marginTop: px(20), fontWeight: 700, fontSize: px(40), alignItems: "baseline" }}>
            <span>Total:</span>
            <span>{m.total}</span>
          </div>
          {m.payment.map(([k, v]) => (
            <div key={k} style={{ ...row, marginTop: px(6), fontSize: px(22) }}>
              <span>{k}</span>
              <span>{v}</span>
            </div>
          ))}
          {m.pending && <div style={{ display: "flex", justifyContent: "center", marginTop: px(12), fontWeight: 700, width: "100%" }}>{m.pending}</div>}
        </div>

        {/* QR de la factura y despedida */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginTop: px(18), width: "100%" }}>
          {m.qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.qr} alt="" width={px(220)} height={px(220)} />
          )}
          {m.verifactu && <div style={{ fontWeight: 700, marginTop: px(8) }}>VERI*FACTU</div>}
          {m.verifactu && <div style={{ fontSize: small, marginTop: px(2) }}>Factura verificable en la sede electrónica de la AEAT</div>}
          <div style={{ marginTop: px(16), fontSize: px(22) }}>{m.thanks}</div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: await loadFonts() }
  );

  // A blanco y negro, cortando el blanco que sobra abajo.
  const png = Buffer.from(await img.arrayBuffer());
  const { data, info } = await sharp(png).flatten({ background: "#fff" }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const dark = (x: number, y: number) => data[(y * width + x) * info.channels] < 150;
  let last = 0;
  for (let y = info.height - 1; y >= 0 && !last; y--)
    for (let x = 0; x < width; x += 2)
      if (dark(x, y)) {
        last = y;
        break;
      }
  const height = Math.min(info.height, last + px(8));
  const rowBytes = Math.ceil(width / 8);
  const bits = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (dark(x, y)) bits[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
  return { width, height, data: bits };
}
