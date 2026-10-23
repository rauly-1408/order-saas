// Texto libre que escribe un cliente o un empleado: sin caracteres de control
// (que una impresora de tickets interpretaría como órdenes, p. ej. abrir el
// cajón) y con un largo máximo. Devuelve "" si no es texto.
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
}
