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
