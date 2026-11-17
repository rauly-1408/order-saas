import { describe, expect, it } from "vitest";
import { parseOnline } from "../brand";
import { restaurantJsonLd } from "../seo";

describe("presencia online", () => {
  it("saca el código de la etiqueta de Google y acepta imágenes de Archivos", () => {
    const o = parseOnline({ googleVerification: '<meta name="google-site-verification" content="abcDEF123_-xyz456" />', shareImageUrl: "/api/media/demo/abc.webp", youtube: "youtube.com/@x" });
    expect(o.googleVerification).toBe("abcDEF123_-xyz456");
    expect(o.shareImageUrl).toBe("/api/media/demo/abc.webp");
    expect(o.youtube).toBe("https://youtube.com/@x");
    expect(parseOnline({ googleVerification: "corto", shareImageUrl: "javascript:alert(1)" })).toMatchObject({ googleVerification: null, shareImageUrl: null });
  });
  it("ficha de restaurante con dirección, redes y sin «<» sin escapar", () => {
    const ld = restaurantJsonLd({
      name: "Está <Fetén>",
      url: "https://x.app/pedir/e",
      business: { legalName: null, taxId: null, street: "Arabial 92", postalCode: "18003", city: "Granada", province: "Granada", phone: "958000000", email: null, whatsapp: null, registry: null, mapsLink: "https://maps.app/x" },
      online: parseOnline({ instagram: "https://instagram.com/e" }),
      image: null,
      reservations: true,
    });
    expect(ld).not.toContain("<");
    const d = JSON.parse(ld);
    expect(d["@type"]).toBe("Restaurant");
    expect(d.address.addressLocality).toBe("Granada");
    expect(d.sameAs).toEqual(["https://instagram.com/e", "https://maps.app/x"]);
    expect(d.acceptsReservations).toBe(true);
  });
});
