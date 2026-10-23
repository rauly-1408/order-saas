// Generador ESC/POS para impresoras térmicas de tickets (Epson, Star, 10POS y
// compatibles). Produce los bytes que el agente del local manda al puerto 9100.
// Sin dependencias: la codificación de acentos y € se hace a mano (CP858).
// Ver docs/IMPRESION.md

const ESC = 0x1b;
const GS = 0x1d;

// CP858 = CP850 + € en 0xD5. Mapa de los caracteres que usamos en español.
const CP858: Record<string, number> = {
  "á": 0xa0, "é": 0x82, "í": 0xa1, "ó": 0xa2, "ú": 0xa3, "ñ": 0xa4, "ü": 0x81,
  "Á": 0xb5, "É": 0x90, "Í": 0xd6, "Ó": 0xe0, "Ú": 0xe9, "Ñ": 0xa5, "Ü": 0x9a,
  "ç": 0x87, "Ç": 0x80, "€": 0xd5, "º": 0xa7, "ª": 0xa6, "¿": 0xa8, "¡": 0xad, "·": 0xfa, "°": 0xf8,
  "à": 0x85, "è": 0x8a, "ì": 0x8d, "ò": 0x95, "ù": 0x97, "â": 0x83, "ê": 0x88, "î": 0x8c, "ô": 0x93, "û": 0x96, "ö": 0x94, "ä": 0x84, "ë": 0x89, "ï": 0x8b,
};

// Caracteres que no están en CP858 se aproximan (— → -, « » → ").
const FALLBACK: Record<string, string> = { "—": "-", "–": "-", "«": '"', "»": '"', "“": '"', "”": '"', "‘": "'", "’": "'", "…": "...", "•": "-", "×": "x" };

export type Codepage = "cp858" | "ascii";

function encode(text: string, codepage: Codepage): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x80) {
      out.push(code);
      continue;
    }
    const fb = FALLBACK[ch];
    if (fb) {
      for (const c of fb) out.push(c.charCodeAt(0));
      continue;
    }
    if (codepage === "cp858" && CP858[ch] !== undefined) {
      out.push(CP858[ch]);
      continue;
    }
    // ascii: sin acentos; € como EUR
    if (ch === "€") {
      for (const c of "EUR") out.push(c.charCodeAt(0));
      continue;
    }
    const plain = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const pc = plain.codePointAt(0) ?? 0x3f;
    out.push(pc < 0x80 ? pc : 0x3f);
  }
  return out;
}

export type PrinterOptions = { width: 48 | 42 | 32; codepage: Codepage };

// Constructor de tickets: se encadenan llamadas y al final .bytes().
export class Escpos {
  private buf: number[] = [];
  readonly width: number;
  private codepage: Codepage;

  constructor(opts: Partial<PrinterOptions> = {}) {
    this.width = opts.width ?? 48;
    this.codepage = opts.codepage ?? "cp858";
    this.buf.push(ESC, 0x40); // init
    // ESC t n: tabla de caracteres (19 = PC858 en Epson y compatibles; 0 = PC437 para ascii)
    this.buf.push(ESC, 0x74, this.codepage === "cp858" ? 19 : 0);
  }

  private raw(...b: number[]) {
    this.buf.push(...b);
    return this;
  }
  text(s: string) {
    this.buf.push(...encode(s, this.codepage));
    return this;
  }
  line(s = "") {
    return this.text(s).raw(0x0a);
  }
  feed(n = 1) {
    return this.raw(ESC, 0x64, Math.max(0, Math.min(n, 20)));
  }
  align(a: "left" | "center" | "right") {
    return this.raw(ESC, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2);
  }
  bold(on: boolean) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }
  // Tamaño: ancho y alto ×1 o ×2 (GS ! n).
  size(w: 1 | 2, h: 1 | 2) {
    return this.raw(GS, 0x21, ((w - 1) << 4) | (h - 1));
  }
  underline(on: boolean) {
    return this.raw(ESC, 0x2d, on ? 1 : 0);
  }
  rule(ch = "-") {
    return this.line(ch.repeat(this.width));
  }
  // Dos columnas: texto a la izquierda, importe a la derecha, en una línea.
  row(left: string, right: string, opts: { indent?: number; width?: number } = {}) {
    const width = opts.width ?? this.width;
    const indent = " ".repeat(opts.indent ?? 0);
    const room = width - right.length - 1 - indent.length;
    const l = left.length > room ? left.slice(0, Math.max(room - 1, 0)) + "…" : left;
    const pad = " ".repeat(Math.max(width - indent.length - l.length - right.length, 1));
    return this.line(`${indent}${l}${pad}${right}`);
  }
  // Texto largo partido en líneas que caben, con sangría.
  wrap(s: string, opts: { indent?: number; width?: number } = {}) {
    const width = (opts.width ?? this.width) - (opts.indent ?? 0);
    const indent = " ".repeat(opts.indent ?? 0);
    const words = s.split(/\s+/).filter(Boolean);
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > width) {
        if (cur) this.line(indent + cur);
        cur = w.length > width ? w.slice(0, width) : w;
      } else cur = (cur + " " + w).trim();
    }
    if (cur) this.line(indent + cur);
    return this;
  }
  // Corte parcial (GS V 66 n) tras avanzar papel.
  cut() {
    return this.feed(4).raw(GS, 0x56, 66, 0);
  }
  // Abre el cajón conectado a la impresora (ESC p m t1 t2).
  drawer() {
    return this.raw(ESC, 0x70, 0, 25, 250);
  }
  bytes(): Uint8Array {
    return Uint8Array.from(this.buf);
  }
}
