"use client";

import { fullAddress, LEGAL_DOCS, mapsUrl, telHref, whatsappHref, type BusinessInfo } from "@/app/lib/business";
import { SOCIAL_FIELDS, type OnlinePresence } from "@/app/lib/brand";
import { DAY_KEYS, DAY_LABEL, rangesLabel, type WeeklyHours } from "@/app/lib/storeStatus";
import { dayName, ui, type Lang } from "@/app/lib/i18n";

// Pie de la tienda: logo, contacto, horario, redes y enlaces legales, con los
// datos de Configuración → Información del negocio (obligatorios por la LSSI).

type Props = {
  tenant: string;
  tenantName: string;
  logoUrl: string | null;
  business: BusinessInfo;
  hours: WeeklyHours | null;
  online?: OnlinePresence;
  upperHeadings: boolean;
  lang?: Lang;
};

// Agrupa días seguidos con el mismo horario: "Lunes a jueves · 13:00–16:00 · 20:00–23:30".
function groupedHours(hours: WeeklyHours, lang: Lang): { days: string; ranges: string }[] {
  const day = (i: number) => dayName(DAY_LABEL[DAY_KEYS[i]], lang);
  const out: { from: number; to: number; ranges: string }[] = [];
  DAY_KEYS.forEach((d, i) => {
    const r = hours[d].length ? rangesLabel(hours[d]) : lang === "en" ? "Closed" : "Cerrado";
    const last = out[out.length - 1];
    if (last && last.ranges === r && last.to === i - 1) last.to = i;
    else out.push({ from: i, to: i, ranges: r });
  });
  return out.map((g) => ({
    days: g.from === g.to ? day(g.from) : lang === "en" ? `${day(g.from)} to ${day(g.to)}` : `${day(g.from)} a ${day(g.to).toLowerCase()}`,
    ranges: g.ranges,
  }));
}

export default function StoreFooter({ tenant, tenantName, logoUrl, business: b, hours, online, upperHeadings, lang = "es" }: Props) {
  const T = ui(lang);
  const address = fullAddress(b);
  const maps = mapsUrl(b, tenantName);
  const socials = online ? SOCIAL_FIELDS.filter((f) => online[f.key]) : [];
  const schedule = hours && DAY_KEYS.some((d) => hours[d].length) ? groupedHours(hours, lang) : null;
  const year = new Date().getFullYear();
  const colTitle = "mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]";
  // inline-block con py-2: blanco de toque cómodo (unos 40 px) sin separar más la lista
  const link = "-my-2 inline-block py-2 text-[14px] text-[var(--text-primary)] no-underline hover:text-[var(--brand-accent)] hover:underline";

  return (
    <footer className="mt-16 border-t border-[var(--border)] bg-[var(--surface-0)]" aria-label={T.restaurantInfo}>
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        {/* Marca y redes */}
        <div>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={tenantName} className="h-12 w-auto max-w-[200px] object-contain" />
          ) : (
            <p className="text-[30px] text-[var(--heading-color)]" style={{ fontFamily: "var(--font-heading)", textTransform: upperHeadings ? "uppercase" : "none", fontWeight: upperHeadings ? 400 : 800, lineHeight: 1 }}>
              {tenantName}
            </p>
          )}
          <p className="mt-3 max-w-xs text-[14px] text-[var(--text-secondary)]">{T.footerTagline}</p>
          {socials.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {socials.map((f) => (
                <a key={f.key} href={online![f.key]!} target="_blank" rel="noopener noreferrer" className="p-press rounded-full border border-[var(--border)] px-4 py-2.5 text-[13px] font-semibold text-[var(--text-primary)] no-underline hover:border-[var(--brand-accent)] hover:text-[var(--brand-accent)]">
                  {f.key === "reviewsUrl" ? T.reviews : f.label}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Contacto */}
        <div>
          <p className={colTitle}>{T.contact}</p>
          <ul className="space-y-2.5">
            {address && (
              <li className="flex gap-2">
                <span aria-hidden>📍</span>
                {maps ? (
                  <a href={maps} target="_blank" rel="noopener noreferrer" className={link}>
                    {address}
                  </a>
                ) : (
                  <span className="text-[14px]">{address}</span>
                )}
              </li>
            )}
            {b.phone && (
              <li className="flex gap-2">
                <span aria-hidden>📞</span>
                <a href={telHref(b.phone)} className={link}>
                  {b.phone}
                </a>
              </li>
            )}
            {b.whatsapp && (
              <li className="flex gap-2">
                <span aria-hidden>💬</span>
                <a href={whatsappHref(b.whatsapp)} target="_blank" rel="noopener noreferrer" className={link}>
                  WhatsApp
                </a>
              </li>
            )}
            {b.email && (
              <li className="flex gap-2">
                <span aria-hidden>✉️</span>
                <a href={`mailto:${b.email}`} className={`${link} break-all`}>
                  {b.email}
                </a>
              </li>
            )}
          </ul>
        </div>

        {/* Horario */}
        <div>
          <p className={colTitle}>{T.hours}</p>
          {schedule ? (
            <ul className="space-y-1.5">
              {schedule.map((g) => (
                <li key={g.days} className="text-[14px]">
                  <span className="font-semibold">{g.days}</span>
                  <span className="block text-[13px] text-[var(--text-secondary)]">{g.ranges}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-[var(--text-secondary)]">{T.askInStore}</p>
          )}
        </div>

        {/* Información legal */}
        <div>
          <p className={colTitle}>{T.info}</p>
          <ul className="space-y-2">
            {LEGAL_DOCS.map((d) => (
              <li key={d.slug}>
                <a href={`/pedir/${tenant}/legal/${d.slug}`} className={link}>
                  {d.title}
                </a>
              </li>
            ))}
            <li className="text-[13px] text-[var(--text-secondary)]">{T.allergensFooter}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[var(--border)]">
        <p className="mx-auto w-full max-w-7xl px-4 py-5 text-[12px] text-[var(--text-secondary)] sm:px-8">
          © {year} {b.legalName ?? tenantName}
          {b.taxId ? ` · NIF ${b.taxId}` : ""}
          {address ? ` · ${address}` : ""}
        </p>
      </div>
    </footer>
  );
}
