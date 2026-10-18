# Inicio del panel

Panel → **Inicio** (`/admin/[tenant]/home`). Solo gerentes, porque muestra ingresos.

## Qué se ve

1. **Cabecera**: «Hoy en {restaurante}», con los ingresos del día.
2. **Cifras clave**: pedidos de hoy, activos ahora, ticket medio y tamaño de la carta.
3. **Haz tuya tu tienda**: ideas para personalizar la tienda, al estilo de las tarjetas del Inicio de Shopify.
4. **Últimos pedidos**.

## Tarjetas «Haz tuya tu tienda»

- **Solo salen las que faltan.** Cuando el dueño activa algo, su tarjeta desaparece sola. Arriba se ve «X de 14 cosas hechas», con una barra de progreso.
- Salen 6 tarjetas; el resto se abre con «Ver N ideas más».
- Cada tarjeta se puede **ocultar con ✕**. Se recuerda en ese navegador (`localStorage`, clave `inicio-ocultas:{tenant}`). «Mostrar las ocultas» las recupera.
- El botón de cada tarjeta lleva al sitio exacto donde se activa.

| Tarjeta | Cuándo desaparece | Lleva a |
|---|---|---|
| Completa los datos de tu negocio | No falta ningún dato obligatorio | Configuración → Negocio |
| Cobra online con tarjeta y Bizum | Hay una pasarela de pago | Configuración → Pagos |
| Haz que la tienda se vea como tu local | Hay logotipo | Configuración → Marca |
| N productos sin foto | Todos los productos tienen foto | Carta |
| Crea menús a precio cerrado | Hay algún menú (combo) | Carta |
| Premia a los que repiten | La tarjeta de sellos está activa | Clientes |
| Tu carta también en inglés | El inglés está activo | Configuración → Idiomas |
| Reparte sin tener repartidor | Hay reparto externo (Glovo…) | Configuración → Envío y entrega |
| Lanza una promoción | Hay alguna promoción activa | Clientes |
| Deja que tus clientes den propina | Las propinas están activas | Configuración → Pantalla de pago |
| Consigue más reseñas en Google | Hay enlace de reseñas | Configuración → Marca |
| Vende tarjetas regalo | Hay alguna tarjeta regalo | Configuración → Tarjetas regalo |
| Añade a tu equipo | Hay más de un usuario activo | Configuración → Usuarios |
| Tu tienda con tu propio dominio | Hay un dominio | Configuración → Dominios |

## Producto estrella

- Muestra el producto más vendido en los últimos 7 días, sus unidades y la comparación con los 7 días anteriores.
- Incluye un gráfico de línea por día. Al pasar el dedo o el ratón, enseña las unidades de ese día.
- No cuenta los pedidos cancelados ni los que están pendientes de pago.
- Solo aparece si hubo ventas esa semana.

## Código

- `home/cards.ts`: lee del servidor el estado de cada tarjeta (función `homeCards`) y calcula el producto estrella.
- `home/GrowthCards.tsx`: tarjetas, ilustraciones (hechas con CSS, en los colores del panel), el gráfico y el ✕.
- Para añadir una tarjeta, añade una entrada a `all` en `cards.ts` con su condición `done`. Si quieres un dibujo nuevo, añade un caso en `Art`.
