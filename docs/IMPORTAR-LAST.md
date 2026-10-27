# Importar de Last.app

Para restaurantes que vienen de Last.app. **No tiene botón en el panel** (se quitó de Carta tras usarlo con Estafetén): se lanza con la ruta de abajo desde una sesión de gerente, pegando la dirección de su tienda (`https://xxx.last.shop`). Trae, producto a producto:

- **Fotos**: se descargan (cuadradas, 1000 px) y se guardan en Archivos; la foto importada sustituye a la que hubiera.
- **Alérgenos**: los 14 oficiales. Se SUMAN a los que ya tenga el producto; nunca se quita ninguno.
- **Sellos**: Vegano, Vegetariano y Sin gluten. También se suman.

## Cómo funciona

- La tienda de Last trae todos sus datos en `<script id="__NUXT_DATA__">`. `lib/lastImport.ts` los lee (`parseLastStore`) y empareja por nombre (`matchProducts`): sin tildes, sin coletillas («Genil -Estilo pollo» → «genil») y respetando cantidades («6 uds» ≠ «12 uds»).
- `POST /api/admin/[tenant]/importar-last`:
  - sin `apply`: devuelve nuestros productos, los de Last y la pareja propuesta;
  - con `apply: [{ productId, lastName }]`: importa.
  Solo gerentes. Solo se aceptan direcciones `*.last.shop` y fotos de `res.cloudinary.com/lastpos`.

## Alérgenos y sellos en la carta

- `Product.allergens`: los declarados en Carta (o importados). En la tienda se suman a los del escandallo (`lib/menu.ts`).
- `Product.dietTags`: `VEGAN`, `VEGETARIAN`, `GLUTEN_FREE` (`lib/diet.ts`).
- Iconos propios en `pedir/[tenant]/FoodIcons.tsx`: un círculo de color con el dibujo en blanco (trazos de Lucide; cacahuete y sésamo dibujados a mano).
