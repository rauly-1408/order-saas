import { prisma } from "@/app/lib/prisma";
import { getTenantTheme, themeToCssVars, SYSTEM_DEFAULT_THEME } from "@/app/lib/tenantConfig";
import { readBusiness } from "@/app/lib/business";
import { reservationLabel } from "@/app/lib/reservations";
import { storeLang } from "@/app/lib/storeLang";
import { tenantTimeZone } from "@/app/lib/time";
import { ui } from "@/app/lib/i18n";
import CancelReservation from "./CancelReservation";
import ConfirmAttendance from "./ConfirmAttendance";

export const dynamic = "force-dynamic";

const isUpcoming = (d: Date) => d.getTime() > Date.now();

// La reserva del cliente (enlace del email): ver y cancelar. Ver docs/RESERVAS.md
export default async function ReservaPage({ params }: { params: Promise<{ tenant: string; code: string }> }) {
  const { tenant, code } = await params;
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { id: true, name: true, branding: true, settings: true } });
  const lang = await storeLang(t?.settings);
  const T = ui(lang);
  const cssVars = themeToCssVars(getTenantTheme((t?.branding as Record<string, unknown>) ?? {}) ?? SYSTEM_DEFAULT_THEME);
  const r = t ? await prisma.reservation.findFirst({ where: { code, tenantId: t.id }, include: { store: { select: { name: true, address: true } } } }) : null;
  const biz = readBusiness(t?.settings);
  const tz = tenantTimeZone(t?.settings);
  const canCancel = !!r && ["PENDING", "CONFIRMED", "WAITLIST"].includes(r.status) && isUpcoming(r.startsAt);
  const canConfirm = !!r && r.status === "CONFIRMED" && !r.customerConfirmedAt && isUpcoming(r.startsAt);
  const tone = r?.status === "CANCELLED" || r?.status === "NO_SHOW" ? "bg-red-100 text-red-800" : r?.status === "PENDING" || r?.status === "WAITLIST" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800";
  const address = r?.store.address || [biz.street, biz.city].filter(Boolean).join(", ");
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]" style={{ ...(cssVars as React.CSSProperties), fontFamily: cssVars["--font-body"] }}>
      <header className="flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-0)] px-4 sm:px-8">
        <a href={`/pedir/${tenant}`} className="p-press flex h-11 w-11 items-center justify-center rounded-full bg-black/[0.05] text-[20px] text-[var(--text-primary)] no-underline" aria-label={T.backToMenu}>‹</a>
        <span className="truncate text-[16px] font-semibold">{t?.name}</span>
      </header>
      <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        {!r ? (
          <p className="rounded-[26px] bg-[var(--surface-0)] p-6 text-center text-[17px] font-semibold">{T.bookNotFound}</p>
        ) : (
          <section className="rounded-[26px] bg-[var(--surface-0)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:p-8">
            <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{T.bookYour}</p>
            <h1 className="mt-1 text-[26px] font-bold leading-tight first-letter:uppercase">{reservationLabel(r.startsAt, tz, lang)}</h1>
            <p className="mt-1 text-[16px] text-[var(--text-secondary)]">{T.bookPeopleN(r.guests)} · {r.name}</p>
            <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-[13px] font-bold ${tone}`}>{T.bookStatus[r.status] ?? r.status}</span>
            {(address || biz.phone) && <p className="mt-5 text-[15px]">{[address, biz.phone].filter(Boolean).join(" · ")}</p>}
            {r.notes && <p className="mt-2 text-[14px] text-[var(--text-secondary)]">{r.notes}</p>}
            {r.status === "WAITLIST" && <p className="mt-4 text-[15px]">{T.bookWaitDoneText}</p>}
            {r.status === "CONFIRMED" && r.customerConfirmedAt && <p className="mt-4 text-[15px] font-semibold text-emerald-700">✓ {T.bookGoConfirmed}</p>}
            {canConfirm && <ConfirmAttendance tenant={tenant} code={code} lang={lang} />}
            {canCancel && <CancelReservation tenant={tenant} code={code} lang={lang} waitlist={r.status === "WAITLIST"} tight={canConfirm} />}
            {r.status === "CANCELLED" && (
              <a href={`/pedir/${tenant}/reservar`} className="p-press mt-6 inline-flex rounded-full bg-[var(--brand-accent)] px-6 py-3.5 text-[15px] font-bold text-[var(--on-accent)] no-underline">{T.bookAgain}</a>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
