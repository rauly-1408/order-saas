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
