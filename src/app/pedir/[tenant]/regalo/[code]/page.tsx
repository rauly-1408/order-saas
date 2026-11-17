import type { Metadata } from "next";
import QRCode from "qrcode";
import { prisma } from "@/app/lib/prisma";
import { giftMinOrderCents, normalizeGiftCode } from "@/app/lib/giftCards";
import { getTenantTheme, readableOn } from "@/app/lib/tenantConfig";
import GiftCardVisual from "@/app/components/GiftCardVisual";

// Página pública de una tarjeta regalo: el enlace que el local manda por
// WhatsApp. Enseña la tarjeta, el saldo y el código (con QR para la caja).
// Quien tiene el enlace tiene la tarjeta, como con una tarjeta de papel; el
// código tiene 12 caracteres aleatorios, así que no se puede adivinar.
// Ver docs/CONFIGURACION.md
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tarjeta regalo", robots: { index: false, follow: false } };

const euros = (c: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(c / 100);

export default async function Page({ params }: { params: Promise<{ tenant: string; code: string }> }) {
  const { tenant: slug, code: raw } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true, branding: true, settings: true } });
  const card = tenant ? await prisma.giftCard.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code: normalizeGiftCode(decodeURIComponent(raw)) } } }) : null;
  const theme = getTenantTheme((tenant?.branding as Record<string, unknown>) ?? {});
  const color = theme.primaryColor;

  if (!tenant || !card) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 p-6 text-center text-neutral-900">
        <p className="text-lg font-semibold">Esta tarjeta regalo no existe</p>
        <p className="text-sm text-neutral-500">Revisa el enlace o pregunta en el local.</p>
      </main>
    );
  }

  const branding = (tenant.branding ?? {}) as Record<string, unknown>;
  const logoUrl = (branding.logoSquareUrl as string) || (branding.logoUrl as string) || null;
  const expired = !!card.expiresAt && card.expiresAt < new Date();
  const usable = card.active && !expired && card.balanceCents > 0;
  const qr = await QRCode.toString(card.code, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  const expires = card.expiresAt ? card.expiresAt.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" }) : null;

  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-8 text-neutral-900">
      <div className="mx-auto w-full max-w-md">
        <GiftCardVisual storeName={tenant.name} logoUrl={logoUrl} color={color} textColor={readableOn(color)} amount={euros(card.initialCents)} balance={euros(card.balanceCents)} recipient={card.recipient} code={card.code} expires={expires} />

        <section className="mt-6 rounded-3xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
          {usable ? (
            <>
              <p className="text-lg font-semibold">Tienes {euros(card.balanceCents)} para gastar en {tenant.name}</p>
              <p className="mt-1 text-sm text-neutral-500">Enseña este código en la caja o escríbelo al pagar tu pedido online. Lo que no gastes se queda en la tarjeta.</p>
              {giftMinOrderCents(tenant.settings) > 0 && <p className="mt-1 text-sm text-neutral-500">Compra mínima para usarla: {euros(giftMinOrderCents(tenant.settings))}.</p>}
            </>
          ) : (
            <p className="text-lg font-semibold">{!card.active ? "Esta tarjeta está desactivada" : expired ? "Esta tarjeta ha caducado" : "Esta tarjeta ya no tiene saldo"}</p>
          )}
          <div className="mt-5 flex items-center gap-4">
            <div className="h-28 w-28 shrink-0 rounded-xl bg-white p-2 ring-1 ring-neutral-200" dangerouslySetInnerHTML={{ __html: qr }} aria-label="Código QR de la tarjeta" />
            <div className="min-w-0">
              <p className="text-xs text-neutral-500">Código</p>
              <p className="whitespace-nowrap font-mono text-base font-semibold tracking-[0.06em] sm:text-lg">{card.code}</p>
              {expires && <p className="mt-1 text-xs text-neutral-500">Válida hasta el {expires}</p>}
            </div>
          </div>
          {usable && (
            <a href={`/pedir/${slug}`} className="mt-5 flex min-h-12 items-center justify-center rounded-full text-[15px] font-semibold" style={{ backgroundColor: color, color: readableOn(color) }}>
              Pedir y usar mi tarjeta
            </a>
          )}
        </section>
        <p className="mt-4 text-center text-xs text-neutral-500">Guarda este enlace: es tu tarjeta.</p>
      </div>
    </main>
  );
}
