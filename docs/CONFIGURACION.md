# Configuración (al estilo Shopify)

Panel → **Configuración**, abajo en la barra lateral. Solo gerentes.

## Aspecto

- **Pantalla completa**: dentro de Configuración se oculta la barra lateral del panel. Arriba hay una cabecera «⚙ Configuración» con **✕** para volver al panel.
- **Menú de apartados** a la izquierda, con una **tarjeta de la tienda** arriba (logo, nombre y dirección web; abre la tienda).
- **Móvil**: la portada de Configuración es la lista de apartados. Al entrar en uno aparece «← Configuración» para volver. En el ordenador, la portada abre «Información del negocio».
- Cada apartado lleva título y explicación, y su contenido va en tarjetas.
- **Guardar como Shopify**: no hay botones «Guardar» sueltos. Al cambiar algo aparece arriba la barra oscura **«Cambios sin guardar» · Descartar · Guardar**, que guarda todo lo pendiente de la página. Si vuelves al valor original, desaparece. Al guardar sale un aviso flotante abajo («✓ Cambios guardados»). Los errores salen en rojo.
- Si intentas salir con cambios sin guardar, te avisa: al cerrar la pestaña o al pulsar otro apartado.
- Código: `useSaveBar(id, { dirty, save, discard })` y `toast()` en `configuracion/ui.tsx`. `SaveBarHost` va una vez en el layout.

## Apartados

| Apartado | Qué hay | Dónde se guarda |
|---|---|---|
| **Información del negocio** | Razón social, NIF, dirección, contacto y enlace de Google Maps (ver DATOS-NEGOCIO-Y-LEGAL.md) | `Tenant.settings.business` |
| **Plan y facturación** | Módulos contratados (Retención, Costes) y la comisión del 3 % de los pedidos pagados online, mes a mes (6 meses) | Se calcula de `Order` |
| **Usuarios y permisos** | Ver tabla «Usuarios y permisos» | `User` |
| **Pagos** | Pasarela del restaurante (ver PAGOS.md) | `PaymentAccount` |
| **Pantalla de pago** | Notas del pedido, programar pedidos, casilla de ofertas y **propinas** (5/10/15/20 %) | `Tenant.settings.checkout` |
| **Envío y entrega** | Canales, precios y tiempos (comunes a todos los locales), reparto con plataformas y repartidor externo | `Store`, `Tenant.settings`, `CourierAccount` |
| **Impuestos** | Tipo de IVA (4/10/21 %, 10 % por defecto); «IVA incluido» en la confirmación; IVA y propinas en Informes y en la exportación a Excel | `Tenant.settings.tax` |
| **Sucursales** | Locales: crear, editar, cerrar o abrir al público | `Store` |
| **Horario y zonas** | Horario, cierres y zonas **de cada local** (con varios, se elige arriba) | `Store`, `StoreClosure`, `DeliveryZone` |
| **Tarjetas regalo** | Crear, ver el saldo, desactivar | `GiftCard` |
| **Dominios** | Dirección de la tienda y **dominio propio** | `Tenant.domains` |
| **Marca** | Antes «Personalización»: logos, colores, fuentes, presencia online (ver PERSONALIZACION.md) | `Tenant.branding` |
| **Notificaciones** | Sonido de pedidos en este dispositivo (activar, repetir, probar) y qué avisos recibe el cliente | `localStorage` del dispositivo |
| **Idiomas** | Antes en Carta: carta en inglés con **traducción automática**; revisión opcional en grupos plegables con buscador (ver CARTA-IDIOMAS.md) | `translations` |
| **Políticas** | **Modelo de redacción para hostelería** con los datos del negocio ya puestos: se usa tal cual o se adapta («Adaptar el modelo», «Volver al modelo», «Usar el texto automático») | `Tenant.settings.policies` |

`/admin/[tenant]/personalizacion` redirige a Configuración → Marca. En Carta hay un enlace a Configuración → Idiomas.

## Usuarios y permisos

- **Dos permisos**:
  - **Gerente**: todo el panel;
  - **Pedidos**: solo la pantalla de pedidos. Con varios locales, se puede limitar a uno: solo ve, oye y cambia los pedidos de ese local.
- **Añadir usuario**: email, nombre y permiso. La **contraseña temporal** (12 caracteres) se muestra **una sola vez** para dársela en mano. «Nueva contraseña» genera otra.
- **Desactivar** quita el acceso **al momento**: la sesión se comprueba en la base de datos en cada página y en cada petición (`fresh()` en `lib/auth.ts`). Un usuario desactivado no puede iniciar sesión.
- **Protecciones**:
  - nadie puede desactivarse ni cambiarse el permiso a sí mismo;
  - siempre queda al menos un gerente activo;
  - un email solo puede tener una cuenta.
- **Mi contraseña**: cualquier usuario la cambia con la actual (mínimo 10 caracteres).
- API: `GET/POST/PATCH /api/admin/[tenant]/users` (solo gerentes) y `PUT /api/admin/[tenant]/users/me`.

## Sucursales

- Un local nuevo copia los canales, precios, tiempos y horario del primero. Después se ajustan su horario y sus zonas en «Horario y zonas».
- **Tienda**: con más de un local abierto al público, sale arriba «📍 Tu local: …» (cookie `pedir_store`). La carta, el horario, las zonas y el estado son los de ese local, y el pedido se guarda con su `storeId`. El checkout muestra el local elegido.
- **Pedidos**: filtro «📍 Local» (todos o uno). El empleado limitado a un local solo ve el suyo.
- **Repartidor externo**: se recoge en la dirección del local. Si no se encuentra en el mapa, se usa la del negocio.
- Tiene que quedar al menos un local abierto al público.
- Código: `lib/stores.ts` (`listStores`, `resolveStoreId`); `getStoreOps(…, storeId)`; `storeTenant` usa `?store=` o la cookie `panel_store`.

## Tarjetas regalo

- El restaurante las crea (1 €–1.000 €, nota y caducidad opcionales) y las cobra en el local como una venta normal. El código es de 12 caracteres sin letras confusas (`XXXX-XXXX-XXXX`).
- **Checkout**: el campo «🎁 Tarjeta regalo» solo sale si hay alguna activa con saldo. El cliente ve el saldo y se descuenta del total.
- **Saldo**:
  - se descuenta al crear el pedido, de forma atómica (dos pedidos a la vez no la gastan dos veces);
  - **vuelve a la tarjeta** si el pedido se cancela o el pago online no se completa;
  - si la tarjeta cubre todo, el pedido queda pagado sin pasar por la pasarela.
- `Order.giftCardId` / `giftCardCents`; `totalCents` ya descuenta la tarjeta.

## Propinas

- Activables en Pantalla de pago, con los porcentajes elegidos. Se calculan sobre la comida (sin envío) y se suman al total.
- El panel y la confirmación las muestran.
- `Order.tipCents`.

## Dominio propio

1. El restaurante añade su dominio en Configuración → Dominios (como mucho 3; no puede repetirse entre restaurantes).
2. Crea en su DNS un **CNAME** `pedidos → cname.vercel-dns.com`, o un **A** `@ → 76.76.21.21` si es el dominio raíz. «Comprobar» mira el DNS.
3. **El equipo de la plataforma añade el dominio en Vercel** (proyecto `order-saas` → Settings → Domains) para el certificado https. No hay clave de Vercel en el código.
- `src/proxy.ts`: si la visita llega por un dominio que no es de la plataforma, busca el restaurante (`/api/domains/resolve`, en memoria 5 min) y abre su tienda. `/pedir`, `/api`, `/admin` y `/pwa` funcionan igual. `APP_HOST` (opcional) indica el dominio principal de la plataforma.

## Migración

`20261018120000_settings_shopify`:
- `User.name/active/storeId/lastLoginAt`;
- `Store.sortOrder`;
- `Order.tipCents/giftCardId/giftCardCents`;
- tabla `GiftCard`.
