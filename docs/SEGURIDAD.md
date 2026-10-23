# Seguridad

Revisión de seguridad del 2026-10-24 sobre la Caja, la impresión, VeriFactu y los permisos. Qué se encontró, cómo se arregló y cómo se comprobó.

## Arreglado

| Riesgo | Qué podía pasar | Arreglo |
|---|---|---|
| Órdenes de impresora escondidas en el texto | Un cliente escribía en su nombre o en una nota caracteres de control (ESC, GS) y la impresora los ejecutaba: abrir el cajón, cambiar el tamaño o imprimir «PAGADO». | `lib/text.ts` (`cleanText`) limpia y recorta nombre (80), dirección (200), código postal (10), notas (300) y notas de línea en la tienda y en la Caja. Además `Escpos.encode()` cambia por espacio todo carácter de control: aunque llegue texto sucio de otro sitio, la impresora no lo ejecuta. |
| Dinero visible sin permiso | Pagos, Plan y Clientes enseñaban importes a quien no tenía «Ve lo recaudado». | `payments`, `billing` y `retention/overview` devuelven `null` en los importes sin `seesTakings`; las pantallas muestran el aviso del permiso. |
| Comisión mal calculada | Pagos y Plan contaban también las ventas de la Caja como pedidos online. | Solo cuentan pedidos `source: ONLINE` pagados con tarjeta o Bizum. |
| Informe Z en un cierre a ciegas | Quien cerraba sin ver el dinero recibía el informe con las cifras por la impresora. | El informe de cierre solo se imprime si quien cierra tiene «Ve lo recaudado». |
| Dos cajas abiertas o dos cierres | Dos toques a la vez abrían dos cajas o cerraban la misma dos veces. | Abrir con bloqueo por local (`pg_advisory_xact_lock`); cerrar con `updateMany` condicionado a que siga abierta. |
| Usuario de un local en otro local | Un usuario limitado a un local podía cobrar o abrir caja en otro pasando su id. | `storeForSession` en `lib/stores.ts`: un usuario limitado solo usa su local, y si está inactivo no se le cambia a otro. |
| Descuentos del personal | El rol Pedidos podía aplicar descuentos de línea en la Caja. | Solo los aplica el gerente (`canManageTenant`); para el resto el servidor los ignora y la Caja no muestra el control. |
| Impresora apuntando fuera del local | Con la dirección de una impresora se podía hacer que el agente conectara con cualquier máquina (SSRF). | `isPrinterAddress`: solo IPv4 privadas (10/8, 172.16/12, 192.168/16) y puertos 9100 a 9109, en el panel y también en el agente. |
| Comandas a la impresora de otro local | Con varios locales, todas las impresoras recibían todo. | Cada impresora puede tener su local; el agente acepta `--store` o `ORDER_SAAS_STORE`. |
| Cajón al reimprimir | Reimprimir un ticket de efectivo volvía a abrir el cajón. | La reimpresión nunca manda el pulso del cajón. |
| Token del agente | Peticiones sin límite, latido que podía pisar la configuración, token visible en la lista de procesos y envío sin cifrar. | Límite de peticiones; latido con `jsonb_set` (no reescribe el resto); variables de entorno en el `.bat`; el agente exige https salvo localhost. |
| Cambio de contraseña | Sin límite de intentos con la contraseña actual. | 5 intentos cada 15 minutos. |
| CSV de facturas | Una celda que empezara por `=`, `+` o `@` se ejecutaba como fórmula en Excel. | Se neutraliza con una comilla y se escapan saltos de línea. |
| Vaciar el registro de facturas | El disparador impedía borrar filas pero no `TRUNCATE`. | Disparador `BEFORE TRUNCATE` (migración `20261024100000_verifactu_truncate`). |
| Notas muy largas | Una nota sin espacios (un enlace pegado) desbordaba la confirmación y la tarjeta del pedido. | El texto se parte donde haga falta. |

## Comprobado

En local, con un gerente, un gerente sin «Ve lo recaudado» y un usuario Pedidos:

- Pedido online con caracteres de control: se guarda limpio, la nota se recorta a 300, el descuento enviado se ignora y la comanda no lleva órdenes de cajón.
- Pedidos con descuento en la Caja: se cobra el precio completo; el gerente sí lo aplica.
- Dos aperturas a la vez: una abre y la otra dice «La caja ya está abierta». Dos cierres a la vez: uno cierra y el otro dice «Esta caja ya se ha cerrado». Cierre a ciegas: no se encola informe.
- `TRUNCATE "Invoice"`: rechazado.
- Impresoras en 8.8.8.8, en el puerto 6379 o con nombre de máquina: rechazadas.
- Pruebas automáticas en `lib/__tests__/seguridad.test.ts`.

## Pendiente

- Guardar el token del agente cifrado con hash (hoy se compara en claro).
- Cerrar las demás sesiones al cambiar la contraseña (`sessionVersion`).
- Prueba de carga y ensayo de restaurar una copia de la base de datos.
