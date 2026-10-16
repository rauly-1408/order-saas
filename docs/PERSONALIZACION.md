# Personalización (identidad de marca)

Panel → **Personalización**. Solo gerentes. Dos pestañas, como en Last.app: **Identidad** y **Presencia online**.

## Identidad

| Bloque | Dónde se usa |
|---|---|
| Nombre de la marca | Carta, pestaña del navegador, panel |
| Favicon | Icono de la pestaña de la carta |
| Logotipo principal | Cabecera de la carta |
| Logotipo cuadrado | Icono de la barra lateral del panel y de la app instalada (PWA) |
| Logotipo en blanco y negro | Se guarda para imprimir tickets (cuando haya impresora) |
| Imagen de cabecera | Foto de portada de la carta (con velo oscuro para leer el nombre) y la imagen al compartir el enlace |
| Paleta | Acento (botones), Títulos, Barra superior, Fondo y «Más colores» (avisos, tarjetas, texto, texto secundario, bordes) |
| Fuentes | 13 fuentes de Google para títulos y texto, títulos en mayúsculas opcional |
| Redondeo | Esquinas de las tarjetas (0–28 px) |

- La paleta lleva una **vista previa en vivo** de la carta. Avisa si los títulos o el texto se leen mal (contraste WCAG).
- «Títulos» y «Barra superior» pueden quedar en **automático** (igual que el acento y que las tarjetas). El texto de la barra se elige solo, claro u oscuro, según su color.
- Las imágenes se guardan al subirlas; el resto, con «Guardar cambios».

## Presencia online

- **Título y descripción** para Google y para la vista previa al compartir el enlace (WhatsApp, redes), con vista previa tipo Google.
- **Redes y reseñas**: Instagram, Facebook, TikTok, web y reseñas de Google. Salen como botones al final de la carta.

## Técnica

- Imágenes en la tabla `BrandAsset` (migración `20261016200000_brand_assets`): sin servicios externos ni claves nuevas.
  - El navegador las reduce y comprime antes de subirlas: logos en PNG (con transparencia), portada en JPG. Máximo 1,5 MB.
  - El servidor comprueba el tipo real por los primeros bytes: solo PNG, JPG o WebP; nunca SVG.
  - Se sirven en `GET /api/brand/[tenant]/[kind]?v=…`, con caché inmutable gracias a la versión.
- Subir o quitar: `PUT` / `DELETE /api/admin/[tenant]/brand/assets/[kind]` (kinds: `favicon`, `logo`, `logo-mono`, `logo-square`, `hero`).
- Resto: `PUT /api/admin/[tenant]/brand`, validado en `src/app/lib/brand.ts` (colores `#rrggbb`, fuentes del catálogo, enlaces http/https).
- Se guarda en `Tenant.branding`: `headingColor`, `headerColor`, `headingFontName`, `bodyFontName`, `logoMonoUrl`, `logoSquareUrl` y `online`.
- Las fuentes que no son Inter ni Anton se cargan desde Google Fonts en el layout de `/pedir/[tenant]`, junto con favicon, título y descripción (`generateMetadata`).
