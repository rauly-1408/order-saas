// Vista previa de un ticket: lee los mismos bytes ESC/POS que se mandan a la
// impresora (lib/escpos.ts) y los convierte en líneas para pintarlas en pantalla.
// Así lo que se ve es exactamente lo que va a salir. Ver docs/IMPRESION.md

export type PreviewLine =
  | { type: "text"; text: string; align: "left" | "center" | "right"; bold: boolean; wide: boolean; tall: boolean }
  | { type: "qr"; data: string; svg?: string } // svg: el QR ya dibujado (lo pone el servidor)
  | { type: "feed"; lines: number }
  | { type: "cut" };
export type Preview = { lines: PreviewLine[]; drawer: boolean };

// CP858 al revés (lo que escribe escpos.ts) para volver a ver acentos y €.
const CP858: Record<number, string> = {
  0xa0: "á", 0x82: "é", 0xa1: "í", 0xa2: "ó", 0xa3: "ú", 0xa4: "ñ", 0x81: "ü",
  0xb5: "Á", 0x90: "É", 0xd6: "Í", 0xe0: "Ó", 0xe9: "Ú", 0xa5: "Ñ", 0x9a: "Ü",
  0x87: "ç", 0x80: "Ç", 0xd5: "€", 0xa7: "º", 0xa6: "ª", 0xa8: "¿", 0xad: "¡", 0xfa: "·", 0xf8: "°",
  0x85: "à", 0x8a: "è", 0x8d: "ì", 0x95: "ò", 0x97: "ù", 0x83: "â", 0x88: "ê", 0x8c: "î", 0x93: "ô", 0x96: "û", 0x94: "ö", 0x84: "ä", 0x89: "ë", 0x8b: "ï",
};

export function previewEscpos(bytes: Uint8Array): Preview {
  const lines: PreviewLine[] = [];
  let align: "left" | "center" | "right" = "left";
  let bold = false;
  let wide = false;
  let tall = false;
  let cp858 = true;
  let text = "";
  let qr = "";
  let drawer = false;
  // Las órdenes (negrita, tamaño…) que llegan a mitad de línea valen para la línea entera.
  const flush = () => {
    lines.push({ type: "text", text, align, bold, wide, tall });
    text = "";
  };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x1b) {
      const c = bytes[i + 1];
      if (c === 0x40) i += 1; // init
      else if (c === 0x74) { cp858 = bytes[i + 2] === 19; i += 2; }
      else if (c === 0x61) { const n = bytes[i + 2]; align = n === 1 ? "center" : n === 2 ? "right" : "left"; i += 2; }
      else if (c === 0x45) { bold = bytes[i + 2] === 1; i += 2; }
      else if (c === 0x2d) i += 2; // subrayado: no se usa en la vista previa
      else if (c === 0x64) { if (text) flush(); lines.push({ type: "feed", lines: bytes[i + 2] }); i += 2; }
      else if (c === 0x70) { drawer = true; i += 4; }
      else i += 1;
    } else if (b === 0x1d) {
      const c = bytes[i + 1];
      if (c === 0x21) { const n = bytes[i + 2]; wide = (n >> 4) > 0; tall = (n & 0x0f) > 0; i += 2; }
      else if (c === 0x56) { if (text) flush(); lines.push({ type: "cut" }); i += 3; }
      else if (c === 0x28 && bytes[i + 2] === 0x6b) {
        // GS ( k pL pH cn fn …: el QR se guarda con fn=80 y se imprime con fn=81.
        const len = bytes[i + 3] | (bytes[i + 4] << 8);
        const fn = bytes[i + 6];
        if (fn === 80) qr = String.fromCharCode(...bytes.slice(i + 8, i + 5 + len));
        if (fn === 81) lines.push({ type: "qr", data: qr });
        i += 4 + len;
      } else i += 1;
    } else if (b === 0x0a) flush();
    else if (b >= 0x80) text += (cp858 && CP858[b]) || "?";
    else if (b >= 0x20) text += String.fromCharCode(b);
  }
  if (text) flush();
  return { lines, drawer };
}
