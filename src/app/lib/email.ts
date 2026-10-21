// Envío de emails con Resend (API REST, sin dependencias). Solo funciona con
// RESEND_API_KEY; sin ella, `sendEmail` no envía nada y devuelve false, y la
// app sigue igual (la contraseña temporal se enseña en pantalla, etc.).
// EMAIL_FROM: remitente con dominio verificado en Resend, p. ej.
// «Pedidos <avisos@tuplataforma.com>». Ver docs/OPERACIONES.md
export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

const FROM_DEFAULT = "Pedidos <onboarding@resend.dev>";

export async function sendEmail(msg: { to: string; subject: string; html: string; text: string; replyTo?: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || FROM_DEFAULT, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, ...(msg.replyTo && { reply_to: msg.replyTo }) }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[email] Resend respondió", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] no se pudo enviar", err instanceof Error ? err.message : err);
    return false;
  }
}

// ── Plantillas (español, sencillas y legibles en cualquier móvil) ──────────

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
export const euros = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

function layout(title: string, body: string, footer = ""): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f6f4ec;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#14211c">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border-radius:16px;padding:24px">
      <h1 style="margin:0 0 12px;font-size:20px">${esc(title)}</h1>
      ${body}
    </div>
    <p style="margin:16px 4px 0;font-size:12px;color:#5d6b64">${footer}</p>
  </div></body></html>`;
}

export function newOrderEmail(p: {
  restaurant: string;
  orderNumber: number;
  channel: "DELIVERY" | "TAKEAWAY";
  customerName: string;
  customerPhone: string;
  address: string | null;
  scheduledFor: string | null;
  lines: { quantity: number; name: string; detail: string[]; totalCents: number }[];
  totalCents: number;
  paid: boolean;
  panelUrl: string;
}): { subject: string; html: string; text: string } {
  const where = p.channel === "DELIVERY" ? `A domicilio${p.address ? ` · ${p.address}` : ""}` : "Para recoger";
  const when = p.scheduledFor ? `Programado: ${p.scheduledFor}` : "Lo antes posible";
  const pay = p.paid ? "Pagado online" : "Paga en el local";
  const rows = p.lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${l.quantity} × ${esc(l.name)}${l.detail.length ? `<br><span style="color:#5d6b64;font-size:13px">${esc(l.detail.join(" · "))}</span>` : ""}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${euros(l.totalCents)}</td></tr>`
    )
    .join("");
  const html = layout(
    `Pedido nº ${p.orderNumber} · ${euros(p.totalCents)}`,
    `<p style="margin:0 0 4px"><b>${esc(p.customerName)}</b> · ${esc(p.customerPhone)}</p>
     <p style="margin:0 0 12px;color:#5d6b64">${esc(where)} · ${esc(when)} · ${pay}</p>
     <table style="width:100%;border-collapse:collapse;font-size:15px">${rows}
       <tr><td style="padding:10px 0;font-weight:700">Total</td><td style="padding:10px 0;text-align:right;font-weight:700">${euros(p.totalCents)}</td></tr></table>
     <p style="margin:16px 0 0"><a href="${esc(p.panelUrl)}" style="display:inline-block;background:#0d3328;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">Abrir el panel de pedidos</a></p>`,
    `Aviso automático de ${esc(p.restaurant)}. Puedes apagarlo en Configuración → Notificaciones.`
  );
  const text = [
    `Pedido nº ${p.orderNumber} · ${euros(p.totalCents)}`,
    `${p.customerName} · ${p.customerPhone}`,
    `${where} · ${when} · ${pay}`,
    "",
    ...p.lines.map((l) => `${l.quantity} × ${l.name}${l.detail.length ? ` (${l.detail.join(", ")})` : ""} — ${euros(l.totalCents)}`),
    "",
    `Total: ${euros(p.totalCents)}`,
    `Panel: ${p.panelUrl}`,
  ].join("\n");
  return { subject: `Nuevo pedido nº ${p.orderNumber} · ${euros(p.totalCents)} · ${p.customerName}`, html, text };
}

export function tempPasswordEmail(p: { restaurant: string; email: string; password: string; loginUrl: string; reset: boolean }): { subject: string; html: string; text: string } {
  const intro = p.reset ? "Te han generado una contraseña nueva" : "Te han dado acceso al panel";
  const html = layout(
    `${intro} de ${p.restaurant}`,
    `<p>Entra con tu email <b>${esc(p.email)}</b> y esta contraseña temporal:</p>
     <p style="font-family:ui-monospace,Menlo,monospace;font-size:22px;letter-spacing:.08em;background:#f6f4ec;padding:12px 16px;border-radius:10px;display:inline-block">${esc(p.password)}</p>
     <p style="color:#5d6b64">Puedes cambiarla al entrar, en Configuración → Usuarios y permisos.</p>
     <p style="margin:16px 0 0"><a href="${esc(p.loginUrl)}" style="display:inline-block;background:#0d3328;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">Entrar al panel</a></p>`,
    "Si no esperabas este email, ignóralo."
  );
  const text = `${intro} de ${p.restaurant}.\n\nEmail: ${p.email}\nContraseña temporal: ${p.password}\n\nEntra en ${p.loginUrl} y cámbiala cuando quieras.`;
  return { subject: `${intro} de ${p.restaurant}`, html, text };
}

export function dailySummaryEmail(p: {
  restaurant: string;
  dayLabel: string;
  orders: number;
  revenueCents: number;
  delivery: number;
  takeaway: number;
  cancelled: number;
  top: { name: string; units: number }[];
  reportsUrl: string;
}): { subject: string; html: string; text: string } {
  const avg = p.orders ? Math.round(p.revenueCents / p.orders) : 0;
  const topHtml = p.top.length ? `<ol style="margin:8px 0 0;padding-left:20px">${p.top.map((t) => `<li>${esc(t.name)} · ${t.units} ud</li>`).join("")}</ol>` : "<p style=\"color:#5d6b64\">Sin ventas.</p>";
  const html = layout(
    `Resumen del ${p.dayLabel}`,
    `<table style="width:100%;font-size:15px"><tr><td>Pedidos</td><td style="text-align:right"><b>${p.orders}</b></td></tr>
     <tr><td>Ingresos</td><td style="text-align:right"><b>${euros(p.revenueCents)}</b></td></tr>
     <tr><td>Ticket medio</td><td style="text-align:right">${euros(avg)}</td></tr>
     <tr><td>A domicilio / recoger</td><td style="text-align:right">${p.delivery} / ${p.takeaway}</td></tr>
     <tr><td>Cancelados</td><td style="text-align:right">${p.cancelled}</td></tr></table>
     <p style="margin:14px 0 0"><b>Lo más vendido</b></p>${topHtml}
     <p style="margin:16px 0 0"><a href="${esc(p.reportsUrl)}" style="display:inline-block;background:#0d3328;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">Ver informes</a></p>`,
    `Resumen diario de ${esc(p.restaurant)}. Puedes apagarlo en Configuración → Notificaciones.`
  );
  const text = [`Resumen del ${p.dayLabel} · ${p.restaurant}`, `Pedidos: ${p.orders}`, `Ingresos: ${euros(p.revenueCents)}`, `Ticket medio: ${euros(avg)}`, `A domicilio / recoger: ${p.delivery} / ${p.takeaway}`, `Cancelados: ${p.cancelled}`, "", "Lo más vendido:", ...p.top.map((t, i) => `${i + 1}. ${t.name} · ${t.units} ud`), "", `Informes: ${p.reportsUrl}`].join("\n");
  return { subject: `Resumen del ${p.dayLabel}: ${p.orders} pedidos · ${euros(p.revenueCents)}`, html, text };
}
