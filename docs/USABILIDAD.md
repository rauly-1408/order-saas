# Pruebas de usabilidad

## 2026-10-23 · todos los perfiles

Recorrido en local con un usuario de cada perfil, en móvil (375 px) y ordenador (1440 px):

| Perfil | Quién es | Qué ve |
|---|---|---|
| Cliente | Quien pide en la tienda online, sin cuenta | Carta, opciones, carrito, pago, confirmación y seguimiento |
| Gerente principal | `Gerente` con «Ve lo recaudado» (el administrador) | Todo el panel |
| Gerente sin recaudación | `Gerente` sin «Ve lo recaudado» (p. ej. Ana) | Todo menos ventas e ingresos |
| Pedidos | Encargado o cocina | Pedidos, Caja y Mi cuenta |

Comprobado:

- **Accesos**: el rol Pedidos es redirigido a Pedidos desde Inicio, Informes, Clientes, Carta, Costes, Archivos y Configuración, y las APIs de gerente le responden 403.
- **Sin desbordamiento horizontal** en las 25 pantallas del panel (gerente principal), en Pedidos, Caja, Mi cuenta y Configuración → Usuarios (resto de perfiles) y en la tienda (portada, pago, confirmación), a 375 y 1440 px.
- **Pedido de cliente completo**: añadir un producto con opciones, carrito, pago con la tienda cerrada (pedido programado) y confirmación.

### Hallazgos y estado

| # | Perfil | Hallazgo | Gravedad | Estado |
|---|---|---|---|---|
| 1 | Gerente sin recaudación | Veía los ingresos de hoy y el ticket medio en Inicio, y las ventas completas en Informes (y podía exportarlas), aunque en la Caja no veía lo recaudado | Alta | Arreglado: Inicio enseña «Pedidos de hoy» en lugar de ingresos y oculta el ticket medio; Informes desaparece del menú, la página explica cómo pedir el permiso y la API y la exportación responden 403 |
| 2 | Cocina (impresión) | Al volver a encender el agente se imprimían comandas de pedidos cancelados y de horas antes | Alta | Arreglado: la cola descarta los trabajos de pedidos cancelados y los de más de 2 horas (quedan como fallidos con el motivo) |
| 3 | Pedidos | No podía cambiar su contraseña (Configuración solo es para gerentes) | Media | Arreglado: «Mi cuenta» en el menú de todos los perfiles, con sus datos y el cambio de contraseña |
| 4 | Cliente | La cabecera fija del pago dejaba leer el texto que pasaba por debajo | Media | Arreglado: el desenfoque no llegaba a Chrome (el compilador de CSS se quedaba solo con el prefijo de Safari); orden corregido y fondo más opaco. Mejora también la barra superior del panel en el móvil |
| 5 | Cliente | La confirmación de un pedido para recoger no decía dónde recogerlo | Media | Arreglado: «Recoger en» con la dirección del local y «Cómo llegar» (ficha de Google Maps del negocio o búsqueda) |
| 6 | Cliente | «Vaciar» está junto a «Ver pedido» y vaciaba el carrito sin preguntar | Media | Arreglado: pide confirmación |
| 7 | Cliente | El botón de modalidad decía «Delivery» y el resto de la app «A domicilio» | Baja | Arreglado: «A domicilio» |
| 8 | Gerente | El rol se llamaba «Pedidos (solo pedidos)» aunque también usa la Caja | Baja | Arreglado: «Pedidos (pedidos y caja)» |
| 9 | Cliente | En el pago, cupón, tarjeta regalo y propina van antes que la modalidad y los datos; dos campos grandes al principio frenan a quien no tiene cupón | Media | Arreglado: el pago va en el orden modalidad → cuándo → datos → notas → propina; cupón y tarjeta regalo plegados en el enlace «¿Tienes un cupón o una tarjeta regalo?» (se abren solos si ya hay uno aplicado o un error) |
| 10 | Cliente | Al escribir el teléfono aparece la tarjeta de sellos y empuja el botón de pedir hacia abajo | Baja | Arreglado: la tarjeta de sellos va debajo del botón de pedir; al escribir el teléfono el botón no se mueve |
| 11 | Cliente | La confirmación no repite las opciones de cada producto (pan, guarnición) | Baja | Arreglado: opciones y nota debajo de cada producto |
| 12 | Todos | Aviso de hidratación en Configuración → Pantalla de pago | — | Descartado: lo provoca una extensión del navegador que añade un estilo a `<body>` |

Pendiente de probar con gente real: un día de servicio en Estafetén solo con la Caja (ver `docs/CAJA.md`).

## 2026-10-23 · revisión de todas las tarjetas

Recorrido de las tarjetas del panel (Inicio, Pedidos, Caja, Informes, Clientes, Carta, Costes, Archivos, Configuración) y de la tienda (productos, promociones, sellos), en móvil y ordenador. Regla aplicada: **si algo parece que se puede tocar, se puede tocar y lleva a donde dice; si no, no lo parece**.

| # | Dónde | Hallazgo | Estado |
|---|---|---|---|
| 1 | Carta | En el móvil era una tabla de 720 px: precio, interruptores y «Editar» quedaban fuera de la pantalla | Arreglado: lista de tarjetas por categoría (foto, nombre, precio, estado) que se toca para editar |
| 2 | Carta | El precio se escribía en céntimos («1200 = 12,00 €») | Arreglado: en euros («12,50 €») |
| 3 | Carta | El formulario de editar aparecía arriba del todo, fuera de la vista si el producto estaba abajo | Arreglado: hoja de edición encima de la pantalla, con categoría, foto y los tres interruptores explicados |
| 4 | Carta | Para añadir un producto había que bajar a unas etiquetas al final | Arreglado: «+ Añadir producto» arriba y «+ Añadir» en cada categoría |
| 5 | Carta | «Activo» y «Disponible» se confundían, y «Disponible» no se podía cambiar desde la lista; «Eliminar» siempre a la vista | Arreglado: «En carta» (se ve o no en la tienda) y «Marcar agotado / reponer» a un toque, con aviso; eliminar dentro de la hoja, con confirmación |
| 6 | Inicio | Las cifras parecían tarjetas pulsables pero solo una lo era; los últimos pedidos no llevaban a ningún sitio | Arreglado: cada cifra lleva a su pantalla (con «›») y cada pedido abre Pedidos |
| 7 | Inicio | En el móvil no se veía el estado de los últimos pedidos, y «Cancelado» iba tachado en gris casi invisible | Arreglado: estado siempre visible; cancelado en rojo suave y su importe atenuado |
| 8 | Clientes | «Sin permiso» se leía como un permiso de usuario | Arreglado: «No quiere ofertas», con explicación al pasar el ratón |

Sin cambios: tarjetas de pedido (rediseñadas en la PR #83), Caja, «Haz tuya tu tienda», Informes, Archivos, Configuración y tienda, que ya siguen la regla.

## Avisos propios y conexión (2026-10-25)

- **Nada de avisos del navegador.** Todas las confirmaciones del panel y de la tienda usan `ask()` de `lib/dialog.tsx` en vez de `window.confirm`. Eran 28, en borrar, cancelar, anular, vaciar, salir sin guardar, crear tokens o contraseñas y cerrar la caja o una mesa.
  - Es una tarjeta centrada en el ordenador y una hoja desde abajo en el móvil, con botones de 48 px.
  - Toma los colores del panel o de la tienda según desde dónde se abra.
  - El texto se parte solo: la pregunta (desde «¿») es el título y lo demás, la explicación.
  - El botón lleva el verbo de la pregunta («Borrar», «Sí, cancelar», «Salir sin guardar»…) y es rojo si la acción borra o deshace algo. En ese caso, el foco va a «Cancelar», para que un Intro despistado no confirme.
  - Escape o tocar fuera cancela.
- **Quedan dos del navegador**, porque no se pueden cambiar:
  - El aviso al cerrar la pestaña o recargar con cambios sin guardar (`beforeunload`).
  - La ventana de «Instalar la app».
- **Errores de conexión en español.** `NetworkStatus` (layout raíz) traduce los fallos de red del navegador («Failed to fetch», «Load failed») a «No se ha podido conectar con el servidor…» o «Sin conexión a internet…». Mientras no hay internet, se muestra arriba «Sin conexión a internet: los cambios no se guardarán hasta que vuelva».

## Botones para el dedo (2026-10-30)

El panel se usará en pantallas táctiles (tablet o TPV), así que todo lo que se toca mide al menos **44×44 px**, el mínimo cómodo para el dedo según Apple y Google.

- **Regla general** en `globals.css` (capa base, dentro de `.panel`):
  - botones, desplegables, pestañas, casillas de texto y enlaces con `p-press` miden al menos 44 px de alto, y los botones también 44 px de ancho;
  - las casillas de marcar pasan a 20 px.
- **Excepciones**:
  - el **menú lateral**, que cabe entero en 768 px de alto;
  - los **interruptores** (`role="switch"`): conservan su forma y amplían la zona que responde al dedo sin que se vea;
  - una pieza que deba ser más pequeña, como las celdas del gráfico de horas en Informes, lo anula con `min-h-0 min-w-0`.
- **Enlaces de texto sueltos** («Ver todos ›», «Carta en inglés →», «Factura» en el historial de pedidos): `inline-flex min-h-11`.
- **Enlaces dentro de una frase**: `py-3 -my-3`, para agrandar la zona del dedo sin mover el texto.
- **Medición**: antes había entre 1 y 36 elementos por página por debajo de 40 px (pestañas de 32 px, «Abrir caja» de 28 px, casillas de 16 px, enlaces de 16-20 px). Ahora solo quedan las excepciones, en todas las páginas y a 1024 y 375 px.
