# Carta → Opciones

Lo que el cliente elige al pedir: el pan, la guarnición, los extras, las salsas… Equivale a los «modificadores» de Last.app o Glovo.

- **Grupo** (`ModifierGroup`): la pregunta («Elige tu pan»), si es **obligatorio** y si se elige **solo una** o **varias (hasta N)**.
  - Obligatorio y solo una: en la tienda sale como lista para marcar una.
  - Opcional: sale plegado («Añade extras»).
- **Opciones** (`ModifierOption`): nombre, lo que **suma al precio** y si está **disponible**. El orden de la lista es el de la tienda.
- **Productos** (`ProductModifierGroup`): un grupo se usa en todos los productos que se marquen. Se marcan por categoría o uno a uno.

## Cómo funciona

- `GET/POST/PATCH/DELETE /api/admin/[tenant]/opciones` (solo gerentes). La validación está en `lib/optionGroups.ts`, con pruebas.
- **Al guardar:**
  - las opciones quitadas se borran, y sus líneas de escandallo también;
  - los productos se sincronizan y se actualiza `Product.hasModifiers`;
  - se traduce al inglés solo y se refresca la carta.
- **Los pedidos ya hechos no cambian:** cada línea guarda su copia de las opciones elegidas.
- El código interno del grupo (`code`) se genera a partir del nombre y no cambia al renombrar. Algunos códigos tienen significado: `SIDE` (guarnición) muestra «Incluido» cuando la opción no suma precio.

# Precio en la web

Cada producto puede tener un **precio distinto en la tienda online** (`Product.onlinePriceCents`; vacío = el del local). Se pone en Carta → editar producto → «Precio en la web».

- **Tienda** (`/pedir`): `loadMenu(…, { online: true })` muestra ese precio y `POST /api/orders` lo cobra (`priceOrderItems(…, { online: true })`).
- **Caja y Mesas** (`/api/menu`, `/caja`, mesas): siempre el precio del local.
- Las opciones (pan, extras…) suman lo mismo en los dos canales.
