// Datos estructurados (schema.org) de la tienda: Google entiende que es un
// restaurante, con su dirección, teléfono, redes y carta. Ver docs/MARCA-NORAPP.md
import type { OnlinePresence } from "@/app/lib/brand";
import type { BusinessInfo } from "@/app/lib/business";

export function restaurantJsonLd(o: { name: string; url: string; business: BusinessInfo; online: OnlinePresence; image: string | null; reservations: boolean }): string {
  const b = o.business;
  const sameAs = [o.online.instagram, o.online.facebook, o.online.tiktok, o.online.youtube, o.online.x, o.online.tripadvisor, o.online.website, b.mapsLink].filter(Boolean);
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: o.name,
    url: o.url,
    hasMenu: o.url,
    acceptsReservations: o.reservations,
    ...(o.online.seoDescription && { description: o.online.seoDescription }),
    ...((o.online.shareImageUrl ?? o.image) && { image: o.online.shareImageUrl ?? o.image }),
    ...(b.phone && { telephone: b.phone }),
    ...(b.email && { email: b.email }),
    ...(b.street && {
      address: { "@type": "PostalAddress", streetAddress: b.street, ...(b.postalCode && { postalCode: b.postalCode }), ...(b.city && { addressLocality: b.city }), ...(b.province && { addressRegion: b.province }), addressCountry: "ES" },
    }),
    ...(sameAs.length && { sameAs }),
  };
  // «<» escapado: el JSON va dentro de una etiqueta <script>.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
