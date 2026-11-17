import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

// Icono de la app del panel (PWA): el de NorApp en todos los restaurantes, también
// en Estafetén. Es lo que enseña Chrome en «Abrir en la app» y el móvil en la
// pantalla de inicio. La tienda y la pestaña siguen con el favicon del restaurante.
// Fondo tinta a sangre: vale como icono normal y como «maskable» (el ticket
// queda dentro de la zona segura del 80 %). Ver docs/MARCA-NORAPP.md
const TICKET = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30 14 H70 V66 L65 70 L60 66 L55 70 L50 66 L45 70 L40 66 L35 70 L30 66 Z" fill="#fafaf8"/><path d="M41 52V30h5l9 13V30h5v22h-5l-9-13v13z" fill="#111214"/><rect x="38" y="57" width="24" height="3" rx="1.5" fill="#ff6a13"/><rect x="20" y="74" width="60" height="10" rx="5" fill="#2a2c31"/></svg>`;
const SRC = `data:image/svg+xml;base64,${Buffer.from(TICKET).toString("base64")}`;

export async function GET(req: NextRequest) {
  const n = Number(new URL(req.url).pathname.split("/").pop());
  const size = [180, 192, 512].includes(n) ? n : 192;
  const inner = Math.round(size * 0.8);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#111214" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SRC} width={inner} height={inner} alt="" />
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } }
  );
}
