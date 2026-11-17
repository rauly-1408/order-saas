# Marca NorApp

La plataforma se llama **NorApp**. La marca elegida es la propuesta **C · Ticket**: un ticket con la N que sale de una impresora.

| | |
|---|---|
| Colores | tinta `#111214`, mandarina `#FF6A13`, acero `#8A8F98`, papel `#FAFAF8` |
| Letra | Martian Mono (800) solo para el nombre y las cifras; Figtree para los textos |
| Lema | «Cada pedido, al momento.» |

## Dos capas

- **Marca propia**: Estafetén y su franquicia (`lib/ownBrand.ts`):
  - no se enseña NorApp en ningún sitio;
  - el menú lleva el logo del restaurante arriba y, abajo, Configuración, Ver carta pública, Mi cuenta y Cerrar sesión;
  - se amplía con la variable `NORAPP_OWN_BRAND="estafeten,otro"`.
- **Restaurantes con NorApp**: el menú va como Shopify:
  - el logo de NorApp arriba;
  - abajo, el logo y el nombre del restaurante con el puesto de quien ha entrado;
  - al pulsarlo se abre su menú: el restaurante (abre la carta pública), Ver carta pública, el usuario (puesto y email, lleva a Mi cuenta) y Cerrar sesión;
  - el menú se cierra al tocar fuera o con Escape.

- **NorApp**, la marca de la plataforma, sale:
  - en la pantalla de carga;
  - en la web de venta, el dossier y los iconos (pendiente).
- **Dentro del panel y de la tienda** mandan los colores de cada restaurante: los de Estafetén en Estafetén y su franquicia, y los suyos en cualquier otro. Salen de Configuración → Marca (`lib/panelTheme.ts`).
- No se pinta el panel con la mandarina de NorApp.

## Pantalla de carga

Solo en restaurantes con NorApp, nunca en los de marca propia.

| Cuándo | Duración | Sonido | Dónde |
|---|---|---|---|
| La primera vez que se entra al panel en un dispositivo, al pulsar «Entrar» | 1,8 s | papel que sale + aviso de dos notas | `login/LoginForm.tsx` |
| La primera vez de cada día que se abre el panel | 0,8 s | no | `(panel)/DailySplash.tsx` |

- **Sonido de la primera vez**:
  - el navegador solo deja sonar audio dentro de un toque, por eso se desbloquea en el clic de «Entrar» (`lib/norappSound.ts`);
  - el sonido está sintetizado con Web Audio, sin archivos.
- **Versión diaria**:
  - un script corre antes de pintar y pone `data-on` en la pantalla, para que no se vea el panel y luego la pantalla;
  - el día se guarda en `localStorage` (`norapp-splash-day`) y la primera vez en `norapp-intro`.
- **«Reducir movimiento»**: la versión diaria no sale y la de la primera vez sale sin animación.
- **Estilos**: `.nsplash` en `globals.css`; el componente es `admin/[tenant]/NorappSplash.tsx`.

## Icono de la pestaña (favicon)

- Cada restaurante lleva **su favicon oficial**, el que sube en Configuración → Marca, en todas sus páginas: tienda, entrada al panel, recuperar contraseña, panel y facturas.
- Si no ha subido ninguno, sale el de NorApp (`public/norapp-icon.svg`).
- Código: `lib/tenantIcons.ts`, usado en el layout raíz, `admin/[tenant]/layout.tsx`, `(panel)/layout.tsx` y `pedir/[tenant]/layout.tsx`.
- Ya no hay `app/favicon.ico`: aquel archivo era el triángulo de Vercel y se mezclaba con el del restaurante.

## Icono de la app del panel

- El panel instalado como app (Chrome «Abrir en la app», pantalla de inicio del móvil o la tablet) lleva **el icono de NorApp en todos los restaurantes, también en Estafetén** (petición del usuario, 17-11).
- Lo sirve `app/norapp-icon/[size]` (180, 192 y 512 px; fondo tinta a sangre, vale también como «maskable»), enlazado desde el manifiesto `pwa/[tenant]/manifest.webmanifest` y como icono de Apple en `(panel)/layout.tsx`.
- La pestaña del navegador y la tienda siguen con el favicon del restaurante. La app de colaboradores sigue con el icono del restaurante (`pwa/[tenant]/icon`).
- Chrome actualiza el icono de una app ya instalada por su cuenta (puede tardar un día); si corre prisa, desinstalar y volver a instalar.

## Restaurante de demostración

- `scripts/crear-demo.mjs` crea «Demo NorApp» (`/admin/demo`, `/pedir/demo`) con marca NorApp:
  - una carta de ejemplo de 4 secciones y 12 productos;
  - abierto todo el día, solo para recoger;
  - un gerente con el email y la contraseña que se escriban en la terminal (la contraseña no se ve al escribirla).
- Se puede repetir: si la demo existe no borra nada y solo crea el gerente si falta.

```bash
cd ~/order-saas && node --env-file=.env scripts/crear-demo.mjs
```

## Presencia online (Marca → Presencia online)

- **Google y enlaces compartidos**: título y descripción (vista previa como en Google, con la dirección).
- **Imagen al compartir** (elegida de Archivos o subida; si no, la de cabecera) con **vista previa como en WhatsApp**. Va en `og:image` y en la tarjeta grande de X/Twitter; las rutas propias (`/api/…`) se completan con el dominio (`metadataBase` en `pedir/[tenant]/layout.tsx`).
- **Redes y reseñas**: Instagram, Facebook, TikTok, web, reseñas de Google, YouTube, X y Tripadvisor (botones al final de la carta). El WhatsApp, el teléfono y la dirección están en Información del negocio.
- **Google**: la tienda lleva la ficha de restaurante en datos estructurados (`lib/seo.ts`: nombre, dirección, teléfono, imagen, redes, carta y reservas) y sale en `sitemap.xml` (sin el restaurante «demo»). `robots.txt` deja leer las tiendas y no el panel, la API ni las páginas privadas. Campo opcional con el código de **Google Search Console** (se acepta la etiqueta entera) → `meta google-site-verification`.
