# VeriFactu

Entrega 4 de la Caja (2026-10-23). Facturas simplificadas con numeración legal, huella encadenada, registro inalterable y código QR de la AEAT, según el Real Decreto 1007/2023 (Reglamento de los sistemas informáticos de facturación) y la Orden HAC/1177/2024 (especificaciones técnicas). Obligatorio en 2027: el plazo se aplazó un año (sociedades el 1 de enero y el resto el 1 de julio, según la última normativa; comprobarlo antes de la fecha).

## Qué hace la app

- **Configuración → Facturación · VeriFactu** (gerente): activar (exige razón social y NIF en Información del negocio), modalidad (**VERI*FACTU**, recomendada, o sin envío automático), entorno (**Pruebas** o **Producción**) y letra de la serie. Apagado por defecto.
- **Al cobrar** un pedido se emite su **factura simplificada (F2)**: en la Caja (efectivo, datáfono, Bizum), al confirmarse un pago online y al apuntar el cobro al entregar un pedido «al recoger». Un pedido sin cobrar no se factura.
- **Si se cancela un pedido facturado**, se emite su **rectificativa por diferencias (R5)** con los importes en negativo, en su propia serie.
- **Ticket impreso**: «Factura simplificada», número y fecha, emisor y NIF, base y cuota de IVA, el **QR de cotejo** (lo dibuja la impresora) y, con VERI*FACTU, la leyenda «VERI*FACTU · Factura verificable en la sede electrónica de la AEAT».
- **Confirmación del pedido online**: la factura con su QR y el enlace para comprobarla en la AEAT; si se ha devuelto, su rectificativa.
- **Caja**: el número de factura en la pantalla final del cobro.
- **Registro**: estado de la cadena («Cadena íntegra · N registros»), las últimas 50 facturas (con «Ve lo recaudado») y la descarga del registro completo en CSV para la gestoría.

## Reglas que cumple

- **Numeración**: serie por año (`T2026`, rectificativas `R2026`), correlativa sin huecos: `T2026-000001`, `-000002`…
- **Importe facturado**: lo que paga el cliente por la operación. La propina voluntaria no forma parte de la base; la tarjeta regalo es una forma de pago y se factura igual. Base y cuota con el tipo de Impuestos (10 % por defecto en hostelería).
- **Huella**: SHA-256 en hexadecimal mayúsculas de `IDEmisorFactura=…&NumSerieFactura=…&FechaExpedicionFactura=dd-mm-aaaa&TipoFactura=…&CuotaTotal=…&ImporteTotal=…&Huella=<anterior>&FechaHoraHusoGenRegistro=aaaa-mm-ddThh:mm:ss+hh:mm`, con importes con punto y dos decimales. Comprobada con los ejemplos oficiales de la AEAT (pruebas en `lib/__tests__/verifactu.test.ts`).
- **Encadenamiento**: cada registro guarda la huella del anterior del mismo emisor; la cadena se recalcula entera en «Cadena íntegra». Un bloqueo en la base de datos evita que dos cobros a la vez se encadenen sobre el mismo registro.
- **Inalterable**: un disparador en la base de datos impide borrar registros y cambiar cualquier dato salvo el estado de envío a la AEAT.
- **QR**: `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=…&numserie=…&fecha=dd-mm-aaaa&importe=…` (en Pruebas, `prewww2.aeat.es`), corrección de errores M.

## Lo que falta (necesita al restaurante o al fabricante)

1. **Envío a la AEAT**: necesita el **certificado digital** del restaurante (de la sociedad o del autónomo) para firmar las llamadas al servicio web de la AEAT. Hasta entonces las facturas quedan **«Pendiente de envío»**, encadenadas y guardadas; se enviarán en orden cuando esté. En modalidad sin envío, el certificado sirve para firmar cada registro (XAdES).
2. **Declaración responsable del sistema informático**: la firma el **fabricante del software** (quien comercializa la app, no cada restaurante), con su NIF, nombre del sistema y versión. Se configura con `VERIFACTU_PRODUCER_NAME` y `VERIFACTU_PRODUCER_NIF` en Vercel y debe constar en la web del producto.
3. **Revisión de un asesor fiscal** antes de pasar a Producción con clientes reales.

## Técnica

- Modelo `Invoice` (migraciones `20261023190000_verifactu` y `20261023190100_verifactu_inalterable`): `chainIndex`, tipo, serie y número, `issueDate`, `genTimestamp`, emisor, tipo de IVA, base, cuota, total, factura rectificada, huella anterior y propia, URL del QR, modalidad, entorno y estado de envío. Únicos: `(tenantId, chainIndex)`, `(tenantId, numSerie)`, `(orderId, invoiceType)`.
- `lib/verifactu.ts`: `readVerifactu`, formatos (`amount`, `issueDateOf`, `timestampOf`), `altaHash`, `qrUrlOf`, `splitTax`, `invoiceTotalOf`, `issueInvoice(orderId, "F2" | "R5")` (idempotente, con `pg_advisory_xact_lock`), `issueInvoiceSafe` (no rompe el flujo del pedido) y `verifyChain`.
- Ganchos: Caja (`POST /api/admin/[tenant]/caja`, antes de responder, para enseñar el número), tienda y pago online (antes de imprimir), y `PATCH /api/orders/status` (cobro al entregar → F2; cancelación → R5).
- `GET/PUT /api/admin/[tenant]/verifactu` y `GET /api/admin/[tenant]/verifactu/export` (CSV, con «Ve lo recaudado»).
- Impresión: `Escpos.qr()` (GS ( k, modelo 2, corrección M) y bloque de factura en `renderReceipt`.
- Web: librería `qrcode` (MIT) para el QR en SVG de la confirmación.
