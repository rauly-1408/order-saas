# Carta en inglés (Configuración → Idiomas)

## Qué ve el cliente

- Botón **ES / EN** en la cabecera de la tienda. Si el móvil del cliente está en inglés, la tienda sale en inglés sola.
- Se traduce todo lo que ve: carta (categorías, productos, descripciones, opciones, pasos de los menús, alérgenos), promociones, tarjeta de sellos, checkout, rueda de la hora, confirmación y seguimiento.
- Si un texto no tiene traducción, se muestra en español.
- **No se traduce**: la cocina y el panel (los pedidos llegan en español) y los textos legales.
- La elección se guarda en la cookie técnica `pedir_lang` (un año). Está explicada en la página de cookies.

## Traducción automática

- Al activar «Mostrar mi tienda también en inglés», la IA traduce toda la carta.
- Después, **cada vez que se añade o cambia** un producto, una categoría, un menú, una promoción o la tarjeta de sellos, lo nuevo se traduce solo, en segundo plano (`after()` en esas rutas → `autoTranslateMenu`).
- Al abrir Configuración → Idiomas, si queda algo pendiente, también se traduce.
- Cada traducción recuerda de qué texto en español salió (`translations.en._src`). Si el español cambia, la traducción queda pendiente y se rehace sola. Las correcciones a mano se guardan igual: si luego se cambia el español, se vuelve a traducir.

## Qué hace el dueño

1. Panel → Configuración → **Idiomas** (antes en Carta; desde Carta hay un enlace).
2. **✨ Traducir la carta con IA**: traduce todo en un clic (unos 30 s). Los nombres propios de los platos (Genil, Alhambra…) y palabras como «mollete» se mantienen: «mollete» nunca pasa a «sandwich» (tampoco «bocadillo» en una carta de molletes) y un mismo plato se traduce igual como producto y como opción.
3. Revisar y corregir a mano lo que haga falta → **Guardar correcciones**.
4. **Mostrar en inglés** activa o desactiva el botón ES / EN en la tienda.
5. Si después se añaden productos, **Traducir lo que falta** traduce solo lo nuevo. **Rehacer todo** vuelve a traducirlo todo y borra las correcciones.

Sin la IA configurada (`ANTHROPIC_API_KEY` en Vercel), las traducciones se pueden escribir a mano.

## Técnica

- Migración `20261017120000_menu_translations`: columna `translations` (JSON `{ en: { campo: texto } }`) en Category, Product, ModifierGroup, ModifierOption, ComboSlot, Promotion y LoyaltyProgram.
- `settings.languages = ["es", "en"]` activa el inglés en la tienda.
- `src/app/lib/i18n.ts`: textos fijos de la tienda (`ui(lang)`), `tr()` y `pickLang()`. `src/app/lib/storeLang.ts` elige el idioma en el servidor (cookie, luego idioma del navegador).
- `src/app/lib/menuTranslate.ts`: reúne los textos, los traduce con Claude (salida JSON con esquema, lotes de 120) y los guarda comprobando que son del restaurante.
- API: `GET/POST/PUT /api/admin/[tenant]/translations` (solo panel con sesión).
