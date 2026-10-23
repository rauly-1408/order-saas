# Impresión de comandas y tickets

Entrega 2 de la Caja (2026-10-23). Comanda a cocina al entrar cualquier pedido, ticket al cliente al cobrar en la Caja, y reimpresión desde Pedidos. Ver también `docs/CAJA.md` y `tools/print-agent/README.md`.

## Cómo funciona

La app vive en internet y la impresora en la red del local, así que la app no puede llegar a ella directamente. En medio hay un **agente de impresión**: un programa pequeño (`tools/print-agent/agent.js`, Node sin dependencias) que corre en un ordenador del local, pregunta a la app cada 2 segundos si hay trabajos pendientes y los manda a la impresora por la red (puerto 9100, protocolo ESC/POS, el que entienden Epson, Star, 10POS y compatibles).

```
pedido → PrintJob (PENDING) → agente (GET /api/print/jobs) → impresora:9100 → POST /api/print/jobs {ok}
```

- **Configuración → Impresoras** (gerente): impresoras con nombre, IP, puerto, qué imprime cada una (comandas, tickets), ancho de papel (80 mm = 48 caracteres, 58 mm = 32), codificación (con acentos y €, o sin acentos si el modelo no entiende CP858), copias de comanda y si abre el cajón al cobrar en efectivo. Muestra si el agente está conectado (visto en los últimos 3 minutos), el token, «Imprimir prueba» por impresora y las últimas impresiones con su estado.
- **Qué se imprime solo**: comanda a cocina al entrar un pedido activo (online ya pagado o «al recoger», y de la Caja); ticket al cliente al cobrar en la Caja (efectivo, datáfono o Bizum). Los pedidos online no imprimen ticket solos. Ambos se pueden apagar.
- **Pedidos**: con alguna impresora configurada, cada tarjeta tiene «🖨 Comanda» y «🖨 Ticket» para reimprimir.

## Lo que sale

- **Comanda**: número de pedido grande, hora y origen, tipo (PARA LLEVAR / COMER AQUÍ / A DOMICILIO), programación si la hay, cliente y dirección, líneas en grande con opciones y la nota de línea destacada (`>> sin cebolla`), nota del pedido, y PAGADO (forma) o SIN COBRAR. Sin precios.
- **Ticket**: nombre del restaurante, dirección, razón social, NIF y teléfono (de Información del negocio y del local), número y fecha, tipo y cliente, líneas con opciones, notas y descuentos de línea, subtotal/envío/descuento/propina/tarjeta regalo si los hay, TOTAL, IVA incluido (si está activo en Impuestos), forma de pago y, en efectivo, entregado y cambio; pie con la dirección de la tienda online. Si la impresora tiene «Abre el cajón» y se pagó en efectivo, manda el pulso al cajón.

Este ticket es la base de la factura simplificada de VeriFactu (entrega 6): le faltarán la numeración legal, la huella encadenada y el QR.

## Técnica

- `lib/escpos.ts`: generador de bytes ESC/POS (init, alineación, negrita, tamaño ×2, filas a dos columnas, ajuste de línea, corte, cajón). Codifica a CP858 a mano (acentos, ñ, €); en modo `ascii` quita acentos y escribe EUR.
- `lib/printing.ts`: `readPrinting(settings)` y `parsePrinter`, `renderKitchen`, `renderReceipt`, `renderTest`, `enqueueOrderPrints(orderId, kinds)`, `printOnNewOrder(orderId)` (se llama con `after()` en la tienda, la Caja y al confirmar un pago online), `enqueueTest`.
- `settings.printing`: `{ agentToken, agentSeenAt, autoKitchen, autoReceipt, printers: [{ id, name, host, port, roles, width, codepage, drawer, copies }] }`. El token se crea al guardar la primera vez; «Nuevo token» invalida el anterior.
- Modelo `PrintJob` (migración `20261023170000_print_jobs`): `kind` KITCHEN | RECEIPT | TEST, impresora (`printerId`, `host`, `port`), `data` (bytes), `status` PENDING | PRINTED | FAILED, `attempts` (hasta 5), `error`.
- `GET /api/print/jobs` (Bearer token; busca el restaurante por `settings.printing.agentToken`): antes de servir, marca como FAILED los pendientes de pedidos cancelados («Pedido cancelado») y los de más de 2 horas («Caducado»), para que al encender el agente no salgan comandas viejas; luego hasta 20 pendientes, en base64; actualiza `agentSeenAt` como mucho una vez por minuto. `POST /api/print/jobs { id, ok, error }`: marca impreso o suma un intento (al quinto, FAILED).
- `GET/PUT/POST /api/admin/[tenant]/printers` (gerente): configuración, estado y últimos 8 trabajos; `POST { action: "test" | "newToken" }`.
- `POST /api/admin/[tenant]/print/[orderId] { kind }` (cualquier usuario del restaurante; un usuario con local asignado solo sus pedidos): reimprime.
- El agente se descarga desde el panel (`public/print-agent/agent.js`, copia de `tools/print-agent/agent.js`; hay que mantener las dos iguales).

## Seguridad

- Solo se aceptan impresoras con IPv4 privada y puerto 9100 a 9109, en el panel y en el agente.
- Cada impresora puede pertenecer a un local; el agente de ese local se arranca con `--store ID` o `ORDER_SAAS_STORE`.
- El texto de clientes y notas se limpia de caracteres de control y `Escpos.encode()` no deja pasar ninguno.
- Reimprimir nunca abre el cajón.
- `/api/print/jobs` tiene límite de peticiones y el latido solo actualiza `agentSeenAt`.
- Más detalle en `docs/SEGURIDAD.md`.

## Probado

Con una impresora simulada y con la impresora real 10POS de Estafetén (192.168.1.31): página de prueba y tickets correctos, con acentos y €.

## Pendiente

- Impresora de bebidas / barra por categoría (hoy todas las comandas van a todas las impresoras de comandas).
- Reimprimir desde «Hoy en caja».
- Empaquetar el agente como `.exe` para no tener que instalar Node.
