# VeriFactu

Entrega 4 de la Caja (2026-10-23). Facturas simplificadas con numeración legal, huella encadenada, registro inalterable y código QR de la AEAT, según el Real Decreto 1007/2023 (Reglamento de los sistemas informáticos de facturación) y la Orden HAC/1177/2024 (especificaciones técnicas). Obligatorio en 2027: el plazo se aplazó un año (sociedades el 1 de enero y el resto el 1 de julio, según la última normativa; comprobarlo antes de la fecha).

## Qué hace la app

- **Configuración → Facturación · VeriFactu** (gerente): activar (exige razón social y NIF en Información del negocio), entorno (**Pruebas** o **Producción**), letra de la serie y **certificado digital** para el envío. Apagado por defecto. Modalidad: solo **VERI*FACTU**; la «sin envío» (firma XAdES y registro de eventos) sale como «próximamente» y el servidor la ignora.
- **Al cobrar** un pedido se emite su **factura simplificada (F2)**: en la Caja (efectivo, datáfono, Bizum), al confirmarse un pago online y al apuntar el cobro al entregar un pedido «al recoger». Un pedido sin cobrar no se factura.
- **Si se cancela un pedido facturado**, se emite su **rectificativa por diferencias** con los importes en negativo, en su propia serie: R5 si solo tenía la simplificada, R1 si se le hizo factura completa.
- **Factura completa a nombre del cliente** (sección **Facturas** del menú, 2026-10-28): se busca el ticket por su número (`T2026-000012`) o por el del pedido, se ponen NIF/CIF, razón social y domicilio fiscal del cliente y se emite. Si el pedido tenía su simplificada, la completa es una **F3** («factura emitida en sustitución de facturas simplificadas», mismos importes) y dice a cuál sustituye; si no, una **F1**. Una por pedido. Serie propia `F2026-000001`. Sale en una hoja A4 para imprimir o guardar en PDF y, si hay email configurado (Resend), se envía al cliente. Se llega también desde Pedidos (botón «Factura» en los pedidos cobrados y en «Últimas 24 h») y desde la pantalla final de la Caja («¿Quiere factura a su nombre?»). Exige VeriFactu activo; la puede hacer cualquier usuario del local (la pide el cliente en el mostrador).
- **Ticket impreso**: «Factura simplificada», número y fecha, emisor y NIF, base y cuota de IVA, el **QR de cotejo** (lo dibuja la impresora) y, con VERI*FACTU, la leyenda «VERI*FACTU · Factura verificable en la sede electrónica de la AEAT».
- **Confirmación del pedido online**: la factura con su QR y el enlace para comprobarla en la AEAT; si se ha devuelto, su rectificativa.
- **Caja**: el número de factura en la pantalla final del cobro.
- **Registro**: estado de la cadena («Cadena íntegra · N registros»), las últimas 50 facturas (con «Ve lo recaudado») y la descarga del registro completo en CSV para la gestoría.

## Reglas que cumple

- **Numeración**: serie por año (`T2026`, completas `F2026`, rectificativas `R2026`), correlativa sin huecos: `T2026-000001`, `-000002`…
- **Importe facturado**: lo que paga el cliente por la operación. La propina voluntaria no forma parte de la base; la tarjeta regalo es una forma de pago y se factura igual. Base y cuota con el tipo de Impuestos (10 % por defecto en hostelería).
- **Huella**: SHA-256 en hexadecimal mayúsculas de `IDEmisorFactura=…&NumSerieFactura=…&FechaExpedicionFactura=dd-mm-aaaa&TipoFactura=…&CuotaTotal=…&ImporteTotal=…&Huella=<anterior>&FechaHoraHusoGenRegistro=aaaa-mm-ddThh:mm:ss+hh:mm`, con importes con punto y dos decimales. Comprobada con los ejemplos oficiales de la AEAT (pruebas en `lib/__tests__/verifactu.test.ts`).
- **Encadenamiento**: cada registro guarda la huella del anterior del mismo emisor; la cadena se recalcula entera en «Cadena íntegra». Un bloqueo en la base de datos evita que dos cobros a la vez se encadenen sobre el mismo registro.
- **Inalterable**: un disparador en la base de datos impide borrar registros y cambiar cualquier dato salvo el estado de envío a la AEAT, y otro impide vaciar la tabla (`TRUNCATE`, migración `20261024100000_verifactu_truncate`). El CSV neutraliza las celdas que Excel tomaría por fórmulas.
- **QR**: `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=…&numserie=…&fecha=dd-mm-aaaa&importe=…` (en Pruebas, `prewww2.aeat.es`), corrección de errores M.

## Envío a la AEAT (2026-11-24)

- **Certificado digital** del restaurante (o de un representante apoderado): se sube en Configuración → Facturación (archivo .p12/.pfx y su contraseña). Se lee con `node-forge` (entiende los .p12 antiguos de la FNMT), se guardan **solo la clave y el certificado en PEM, cifrados** (`secretBox`, propósito «aeat-cert») en `VerifactuSender`; ni el archivo ni la contraseña se guardan, y nunca se devuelven al navegador. Se muestra a nombre de quién está, su NIF y su caducidad (aviso 30 días antes). Si el NIF no es el del restaurante, avisa de que solo sirve con apoderamiento y se envía con `Representante` en la cabecera.
- **Cuándo se envía**: al emitir cada factura (en segundo plano con `after()`), al subir el certificado, con el botón «Enviar ahora» y en el cron diario (`/api/cron/daily-summary`). Siempre en orden de la cadena, hasta 1.000 registros por envío y del mismo entorno.
- **Control de flujo**: tras cada envío se espera lo que diga `TiempoEsperaEnvio` (normalmente 60 s), guardado en `nextSendAt`. Dentro de una petición en segundo plano se espera hasta 65 s y se hacen como mucho 3 rondas; lo que quede sale en el siguiente disparo. `lockedUntil` evita dos envíos a la vez del mismo restaurante.
- **Respuesta**: por cada factura `ACEPTADO`, `ACEPTADO_CON_ERRORES` o `RECHAZADO`, con el CSV, el código y la descripción en `aeatResponse` (lo único que el disparador deja cambiar). El código 3000 (duplicado, ya estaba en la AEAT) cuenta como aceptado. Si falla la conexión o la AEAT devuelve un error SOAP, todo sigue pendiente y el motivo sale en «Último intento».
- **Pendiente**: subsanar y reenviar una factura rechazada (`Subsanacion`/`RechazoPrevio`) y la modalidad sin envío. Si un restaurante pasa de Pruebas a Producción, el primer registro de producción enlaza con el último de pruebas.

## Lo que falta (necesita al restaurante o al fabricante)

1. **Declaración responsable del sistema informático**: la firma el **fabricante del software** con su NIF, nombre del sistema y versión. Se configura con `VERIFACTU_PRODUCER_NAME` y `VERIFACTU_PRODUCER_NIF` en Vercel (y opcionalmente `VERIFACTU_SOFTWARE_VERSION`, por defecto «1.0») y debe constar en la web del producto. **Sin estas variables no se envía nada.**
2. **Probar en el entorno de pruebas de la AEAT** con un certificado real antes de pasar a Producción.
3. **Revisión de un asesor fiscal** antes de pasar a Producción con clientes reales.

## Técnica

- Modelo `Invoice` (migraciones `20261023190000_verifactu` y `20261023190100_verifactu_inalterable`): `chainIndex`, tipo, serie y número, `issueDate`, `genTimestamp`, emisor, tipo de IVA, base, cuota, total, factura rectificada, huella anterior y propia, URL del QR, modalidad, entorno y estado de envío. Únicos: `(tenantId, chainIndex)`, `(tenantId, numSerie)`, `(orderId, invoiceType)`.
- `lib/verifactu.ts`: `readVerifactu`, formatos (`amount`, `issueDateOf`, `timestampOf`), `altaHash`, `qrUrlOf`, `splitTax`, `invoiceTotalOf`, `issueInvoice(orderId, "F2" | "R5")` (idempotente, con `pg_advisory_xact_lock`; «R5» rectifica la vigente y es R1 si había completa), `issueFullInvoice(orderId, recipient)` (F3/F1), `readRecipient`, `issueInvoiceSafe` (no rompe el flujo del pedido) y `verifyChain`. Todas añaden a la cadena con `appendRecord`.
- Factura completa: columnas `substitutedInvoiceId`, `recipientNif`, `recipientName`, `recipientAddress` (migración `20261028200000_factura_completa`); `lib/invoiceDoc.ts` (datos de la hoja y el email); `GET/POST /api/admin/[tenant]/facturas` (buscar ticket, emitir, últimas hechas) y `POST /api/admin/[tenant]/facturas/[id]` (enviar por email); página del panel `/admin/[tenant]/facturas` y hoja imprimible `/admin/[tenant]/factura/[id]` (fuera del panel, con sesión). El CSV del registro añade sustituida, NIF, nombre y domicilio del cliente.
- Ganchos: Caja (`POST /api/admin/[tenant]/caja`, antes de responder, para enseñar el número), tienda y pago online (antes de imprimir), y `PATCH /api/orders/status` (cobro al entregar → F2; cancelación → R5).
- `GET/PUT /api/admin/[tenant]/verifactu` y `GET /api/admin/[tenant]/verifactu/export` (CSV, con «Ve lo recaudado»).
- Impresión: `Escpos.qr()` (GS ( k, modelo 2, corrección M) y bloque de factura en `renderReceipt`.
- Web: librería `qrcode` (MIT) para el QR en SVG de la confirmación.
- Envío: `lib/aeatCert.ts` (leer el .p12), `lib/aeatXml.ts` (mensaje `RegFactuSistemaFacturacion` en el orden de los esquemas y lectura de la respuesta), `lib/aeatSend.ts` (`sendPending`, `queueAeatSend`, `sendAllPending`), modelo `VerifactuSender` (migración `20261124130000_verifactu_envio`), rutas `POST/DELETE /api/admin/[tenant]/verifactu/certificado` y `POST /api/admin/[tenant]/verifactu/enviar`. Datos fijos del sistema: nombre «NorApp», id «NA», `NumeroInstalacion` = id del restaurante, `TipoUsoPosibleSoloVerifactu` S, `TipoUsoPosibleMultiOT` S, `IndicadorMultiplesOT` N.
- Pruebas en local: `AEAT_ENDPOINT_OVERRIDE` apunta a un servidor propio (se ignora en Vercel). Pruebas en `lib/__tests__/aeat.test.ts`.
