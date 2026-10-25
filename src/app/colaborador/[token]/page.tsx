import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/app/lib/prisma";
import { tenantTimeZone } from "@/app/lib/time";
import { COUNTED, addMonths, monthOf, monthStart } from "@/app/lib/collaborators";

// Página privada de un colaborador (RRPP, encargado de hotel…): su código, su
// enlace y su QR para repartir, y lo que lleva ganado este mes y los anteriores.
// Sin datos de clientes. El enlace es secreto: se puede cambiar desde el panel.
// Ver docs/COLABORADORES.md

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mis pedidos de colaborador", robots: { index: false, follow: false } };

const euros = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const monthName = (m: string) => {
  const t = new Date(`${m}-15T12:00:00Z`).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export default async function ColaboradorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{10,64}$/.test(token)) notFound();
  const c = await prisma.collaborator.findUnique({
    where: { token },
    select: { id: true, name: true, code: true, commissionPct: true, active: true, tenantId: true },
  });
  if (!c) notFound();
  const tenant = await prisma.tenant.findUnique({ where: { id: c.tenantId }, select: { name: true, slug: true, settings: true } });
  if (!tenant) notFound();
  const tz = tenantTimeZone(tenant.settings);
  const current = monthOf(new Date(), tz);
  const from = monthStart(addMonths(current, -5), tz);

  const [orders, payouts] = await Promise.all([
    prisma.order.findMany({
      where: { collaboratorId: c.id, createdAt: { gte: from }, ...COUNTED },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, orderNumber: true, totalCents: true, commissionCents: true },
    }),
    prisma.collaboratorPayout.findMany({ where: { collaboratorId: c.id }, select: { month: true, amountCents: true, paidAt: true } }),
  ]);
  const paidOf = new Map(payouts.map((p) => [p.month, p]));
  const months = Array.from({ length: 6 }, (_, i) => addMonths(current, -i)).map((m) => {
    const list = orders.filter((o) => o.createdAt >= monthStart(m, tz) && o.createdAt < monthStart(addMonths(m, 1), tz));
    return { month: m, count: list.length, total: list.reduce((a, o) => a + o.totalCents, 0), earned: list.reduce((a, o) => a + o.commissionCents, 0), paid: paidOf.get(m) ?? null };
  });
  const now = months[0];
  const thisMonth = orders.filter((o) => o.createdAt >= monthStart(current, tz));

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const link = `${proto}://${host}/pedir/${tenant.slug}?c=${c.code}`;
  const qr = await QRCode.toString(link, { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 220 });
  const share = `https://wa.me/?text=${encodeURIComponent(`¿Hambre? Pide en ${tenant.name} desde aquí: ${link}`)}`;
  const fmtDay = (d: Date) => d.toLocaleString("es-ES", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <main className="min-h-screen bg-[#f5f5f7] px-4 py-8 text-[#1d1d1f]">
      <div className="mx-auto max-w-md space-y-4">
        <header>
          <p className="text-sm text-[#6e6e73]">{tenant.name} · colaboradores</p>
          <h1 className="text-3xl font-semibold tracking-tight">Hola, {c.name.split(" ")[0]}</h1>
          {!c.active && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Tu código está en pausa. Habla con {tenant.name}.</p>}
        </header>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-[#6e6e73]">{monthName(current)} · llevas ganado</p>
          <p className="text-5xl font-semibold tabular-nums tracking-tight">{euros(now.earned)}</p>
          <p className="mt-1 text-sm text-[#6e6e73] tabular-nums">
            {now.count} {now.count === 1 ? "pedido" : "pedidos"} con tu código · {euros(now.total)} · tu parte, el {c.commissionPct.toLocaleString("es-ES")} %
          </p>
          <p className="mt-3 text-xs text-[#6e6e73]">Se paga en efectivo a principios del mes siguiente.</p>
        </section>

        <section className="rounded-2xl bg-white p-5 text-center shadow-sm">
          <p className="text-sm text-[#6e6e73]">Tu código</p>
          <p className="text-3xl font-bold tracking-widest">{c.code}</p>
          <div className="mx-auto mt-3 w-[220px]" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="mt-2 break-all text-xs text-[#6e6e73]">{link}</p>
          <p className="mt-2 text-sm">Quien pide desde este enlace o este QR, o escribe tu código al pagar, cuenta para ti.</p>
          <a href={share} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block rounded-full bg-[#25d366] px-5 py-3 text-sm font-semibold text-white">
            Compartir por WhatsApp
          </a>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Meses anteriores</h2>
          <ul className="mt-2 divide-y divide-black/5 text-sm">
            {months.slice(1).map((m) => (
              <li key={m.month} className="flex items-center justify-between gap-3 py-2 tabular-nums">
                <span>
                  {monthName(m.month)}
                  <span className="block text-xs text-[#6e6e73]">
                    {m.count} {m.count === 1 ? "pedido" : "pedidos"}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold">{euros(m.earned)}</span>
                  <span className={`block text-xs ${m.paid ? "text-emerald-700" : m.earned ? "text-amber-700" : "text-[#6e6e73]"}`}>
                    {m.paid ? `Pagado el ${m.paid.paidAt.toLocaleDateString("es-ES", { timeZone: tz })}` : m.earned ? "Pendiente de pago" : "—"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {thisMonth.length > 0 && (
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Pedidos de este mes</h2>
            <ul className="mt-2 divide-y divide-black/5 text-sm">
              {thisMonth.map((o, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2 tabular-nums">
                  <span>
                    {fmtDay(o.createdAt)}
                    <span className="block text-xs text-[#6e6e73]">Pedido nº {o.orderNumber} · {euros(o.totalCents)}</span>
                  </span>
                  <span className="font-semibold">+{euros(o.commissionCents)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
