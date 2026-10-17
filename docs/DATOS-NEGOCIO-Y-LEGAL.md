# Datos del negocio, pie de la tienda y textos legales

## Datos del negocio

Panel → **Configuración → Información del negocio** (antes en Personalización; Configuración está abajo en la barra lateral, por apartados). Son los datos que la LSSI (art. 10) obliga a mostrar en una tienda online, más los de contacto.

| Campo | ¿Obligatorio? |
|---|---|
| Razón social o titular (nombre y apellidos si es autónomo) | Sí |
| NIF / CIF (se valida el formato) | Sí |
| Dirección, código postal y ciudad | Sí |
| Provincia | No |
| Teléfono | Sí |
| Email de contacto | Sí |
| WhatsApp | No |
| Registro Mercantil (si es sociedad) | No |
| Enlace de la ficha en Google Maps | No |

- Si falta algún obligatorio, la pestaña muestra ⚠️ y un aviso con lo que falta.
- La primera vez se rellenan solos el teléfono, el WhatsApp y la dirección que había en Configuración → Contacto. Ese bloque de Configuración ahora remite a esta pestaña.
- Se guarda en `Tenant.settings.business`, con `PUT /api/admin/[tenant]/business`.

## Pie de la tienda

Cuatro columnas en escritorio y una en móvil:

1. **Marca:** logo y redes.
2. **Contacto:** dirección, teléfono (llama con un toque), WhatsApp y email. La dirección abre la **ficha del local** en Google Maps: el enlace pegado en Datos del negocio o, si no hay, una búsqueda con el nombre del negocio y la dirección. Solo se aceptan enlaces de Google Maps y se guardan enteros (hasta 2.000 caracteres; si se cortaran, Google abriría un mapa sin el local). Lo más cómodo es el enlace corto de Google Maps → Compartir.
3. **Horario:** los días con el mismo horario se agrupan («Lunes a jueves · 13:00–16:00 · 20:00–23:30»).
4. **Información:** Aviso legal, Privacidad, Cookies, Condiciones de venta y aviso de alérgenos.

Debajo, en una franja: «© año Razón social · NIF · dirección».

## Textos legales

Se publican en `/pedir/[tenant]/legal/{aviso-legal|privacidad|cookies|condiciones}` y se generan con los datos del negocio (`src/app/lib/legalTexts.ts`):

- **Aviso legal:** titular, NIF, domicilio, contacto y registro (LSSI).
- **Privacidad:**
  - responsable;
  - finalidades: pedidos, tarjeta de sellos, ofertas con consentimiento y reseñas;
  - conservación y destinatarios;
  - derechos y AEPD (RGPD/LOPDGDD).
- **Cookies:** solo almacenamiento técnico (carrito, aviso del pedido). No hay analítica ni publicidad, así que no hace falta banner de consentimiento (art. 22.2 LSSI).
- **Condiciones de venta:**
  - precios con IVA y pago;
  - pedidos programados y cancelación;
  - **sin desistimiento por ser comida perecedera** (art. 103 d TRLGDCU);
  - alérgenos y reclamaciones.

Son una **plantilla orientativa**: el panel recomienda revisarlos con un asesor antes de abrir al público. Si en el futuro se añade analítica (Meta Pixel, Google Analytics), habrá que actualizar la política de cookies y poner un banner de consentimiento.
