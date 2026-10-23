# Archivos (biblioteca de imágenes y vídeos)

Panel → **Archivos** (barra lateral). Solo gerentes. Dos pestañas: **Imágenes** y **Vídeos**.

## Qué hace el dueño

- **Subir**: botón «Subir imágenes / vídeos» o arrastrar los archivos a la página (hasta 20 a la vez), con barra de progreso.
- Ver todo lo subido en una **tabla como la de Shopify**: casilla de selección, miniatura, nombre y tipo (PNG, JPG, WebP, MP4…), fecha de adición, tamaño y **en cuántos productos se usa**. Las columnas Nombre, Fecha y Tamaño se ordenan al tocar la cabecera; 50 archivos por página.
- **Seleccionar varios** (o todos los de la página) y borrarlos de una vez; avisa si alguno se usa en un producto.
- En cada fila, dos iconos con tooltip: **enlace** (copia la dirección y avisa «Enlace copiado») y **papelera**. Tocar un archivo abre la **vista previa** a tamaño completo con «Copiar enlace» y «Borrar».
- **Borrar** siempre pregunta en una ventana propia: «¿Borrar «foto.jpg»?» o «¿Borrar 3 archivos?», «Desaparecerán de tu biblioteca. No se puede deshacer», y si alguna imagen se usa en productos, cuáles se quedarán sin foto. Botones «Cancelar» y «Sí, borrar». En el móvil las columnas de fecha, tamaño y referencias pasan debajo del nombre y las acciones van en la vista previa.
- El selector de fotos de un producto (Carta) sigue siendo una cuadrícula de miniaturas.
- **Buscar** por nombre, **copiar el enlace** y **borrar**. Si una imagen se usa en algún producto, avisa antes de borrarla.
- **Fotos de productos** (Carta → editar producto → «Imagen»):
  - «Añadir imagen» abre la biblioteca: se elige una o se sube una nueva, que queda guardada en Archivos;
  - «Quitar» deja el producto sin foto;
  - también se puede **arrastrar una foto** desde el ordenador hasta el campo «Imagen»: se sube a Archivos y queda elegida;
  - ya no se pega una dirección (URL).
  - la ventana se pinta con un portal en `.panel`, fuera de `.p-page`. La animación de entrada de la página encierra los elementos `fixed`, y la ventana quedaba dentro del contenido, gris y fuera de la pantalla.

## Imágenes

- Se reducen y comprimen **en el navegador**, como en Marca: lado mayor 1600 px, como mucho 1,5 MB. JPG para fotos; PNG si tiene transparencia y cabe.
- Se guardan en la base de datos (`MediaFile.data`) y se sirven en `/api/media/[tenant]/[id]`, públicas y con caché de un año: el id no cambia nunca.
- El servidor comprueba el tipo real por los primeros bytes (PNG, JPG o WebP). Como mucho 2.000 archivos por restaurante.

## Vídeos

- MP4, WebM o MOV, hasta 200 MB. Se guardan en **Vercel Blob**, porque la base de datos y las funciones de Vercel no admiten archivos tan grandes (las funciones aceptan como mucho 4,5 MB por petición).
- **Subida directa** del navegador a Vercel Blob (`@vercel/blob/client`):
  1. `POST /api/admin/[tenant]/media/video` da un permiso limitado a la carpeta `tenants/[slug]/videos/`, a esos tipos y a ese tamaño;
  2. al terminar, el navegador registra el vídeo con `{ action: "register" }`. Solo se aceptan direcciones de `*.blob.vercel-storage.com` dentro de esa carpeta.
- Al borrar, se borra también de Vercel Blob.
- **Activación (una vez, en Vercel):** Storage → Create → Blob → conectar al proyecto `order-saas`. Vercel añade solo la variable `BLOB_READ_WRITE_TOKEN`; después hay que volver a publicar. Sin ella, la pestaña Vídeos explica que no están activados.

## Seguridad

- La foto de un producto solo puede ser de la biblioteca del restaurante (`/api/media/[su slug]/…`) o una dirección `https`. Cualquier otra cosa (p. ej. `javascript:`) se rechaza (`productImageUrl` en `lib/media.ts`).

## Técnica

- Migración `20261018170000_media_files`: tabla `MediaFile` (`kind` IMAGE | VIDEO, `data` para imágenes, `url` para vídeos).
- API:
  - `GET/POST/DELETE /api/admin/[tenant]/media`;
  - `POST /api/admin/[tenant]/media/video`;
  - pública: `GET /api/media/[tenant]/[id]`.
- Componentes `archivos/MediaLibrary.tsx` (biblioteca y selector), `ImagePicker.tsx` (campo de imagen) y `compressImage.ts`.
