// Ajustes del ticket del cliente (Configuración → Ticket): qué datos salen,
// el mensaje del pie y el QR a la tienda online. Ver docs/IMPRESION.md
export type TicketSettings = {
  showLogo: boolean; // el «Logotipo en blanco y negro» (o el principal) arriba
  showLegal: boolean; // razón social
  showTaxId: boolean; // NIF (por separado: hay quien quiere el NIF sin la razón social)
  showAddress: boolean;
  showPhone: boolean;
  showTax: boolean; // cuadro de IVA (con factura sale siempre: es obligatorio)
  footer: string; // mensaje propio al pie: gracias, Instagram, wifi…
  qr: boolean; // QR a la tienda online para el próximo pedido
};

export const FOOTER_MAX = 240;
export const TICKET_DEFAULTS: TicketSettings = { showLogo: true, showLegal: true, showTaxId: true, showAddress: true, showPhone: false, showTax: true, footer: "", qr: false };

export function readTicket(settings: unknown): TicketSettings {
  const t = ((settings ?? {}) as Record<string, unknown>).ticket as Record<string, unknown> | undefined;
  const bool = (k: keyof TicketSettings) => (typeof t?.[k] === "boolean" ? (t[k] as boolean) : (TICKET_DEFAULTS[k] as boolean));
  const footer = typeof t?.footer === "string" ? t.footer.replace(/\r/g, "").split("\n").slice(0, 6).join("\n").slice(0, FOOTER_MAX) : "";
  // Antes «showLegal» era razón social y NIF juntos: sin «showTaxId» guardado, el NIF sigue a la razón social.
  const showTaxId = typeof t?.showTaxId === "boolean" ? t.showTaxId : bool("showLegal");
  return { showLogo: bool("showLogo"), showLegal: bool("showLegal"), showTaxId, showAddress: bool("showAddress"), showPhone: bool("showPhone"), showTax: bool("showTax"), footer, qr: bool("qr") };
}
