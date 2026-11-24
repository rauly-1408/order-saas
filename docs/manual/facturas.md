# Facturas

Aquí haces la factura completa a nombre de un cliente (empresa o autónomo) a partir de su ticket. Los tickets normales (facturas simplificadas) se hacen solos al cobrar si tienes VeriFactu activo.

**Dónde:** Menú → Facturas. La ven el gerente y los puestos Encargado de sala y Caja. La configuración de VeriFactu está en Configuración → Facturación · VeriFactu (solo el gerente).

## Hacer una factura a nombre de un cliente

1. En «1. Busca el ticket», escribe el número del ticket (por ejemplo T2026-000012) o el número del pedido (por ejemplo 83) y toca «Buscar».
2. Comprueba que el pedido que sale es el bueno (importe, productos y fecha).
3. En «2. Datos del cliente», rellena «NIF / CIF», «Razón social o nombre» y «Domicilio fiscal», tal como deben salir en la factura.
4. Si quieres enviársela, escribe su email (opcional).
5. Toca «Hacer factura de X €». Se abre la factura en A4.

## Llegar a Facturas más rápido desde Caja o Pedidos

- En la Caja, tras cobrar, toca «¿Quiere factura a su nombre?»: se abre Facturas con el ticket ya buscado.
- En Pedidos, toca «Factura» en un pedido cobrado (en su tarjeta o en «Últimas 24 h»).
Solo te queda poner los datos del cliente.

## Imprimir la factura, guardarla en PDF o enviarla por email

1. Abre la factura (al hacerla, o en «Facturas hechas»).
2. «Imprimir o guardar PDF» abre la impresión del navegador; elige tu impresora o «Guardar como PDF».
3. Para mandarla, escribe el email en «Email del cliente» y toca «Enviar por email».
«‹ Facturas» te devuelve a la lista.

## Ver o reenviar una factura que ya hice

Baja hasta «Facturas hechas» y toca la que quieras para abrirla, imprimirla o enviarla otra vez.
Si buscas un pedido que ya tiene factura, verás «Este pedido ya tiene factura» con el botón «Ver, imprimir o enviar». Solo se hace una por pedido.

## ¿Qué pasa con el ticket cuando hago la factura completa?

Si el pedido ya tenía su ticket (factura simplificada), la factura completa lo sustituye y lo indica («Sustituirá al ticket …»). El importe es el mismo.
Las facturas completas llevan su propia numeración (F2026-000001…).

## Me pone «Para hacer facturas, activa VeriFactu»

Las facturas a nombre del cliente necesitan VeriFactu activo.
El gerente debe ir a Configuración → Facturación · VeriFactu y activar «Emitir facturas VeriFactu». Antes tiene que tener la razón social y el NIF en Configuración → Información del negocio.

## No me deja hacer la factura de un pedido

- «Este pedido aún no está cobrado»: cóbralo primero (en Pedidos o en Mesas) y luego haz la factura.
- «Este pedido está cancelado o devuelto»: no se puede facturar.
- «No encontramos ese ticket»: revisa el número. Puedes buscar por el número del ticket (T…) o por el número del pedido.

## ¿Qué es VeriFactu y qué hace la app por mí?

VeriFactu es el sistema de Hacienda para que las facturas no se puedan alterar. Con él activo, la app:
- hace una factura simplificada con número correlativo cada vez que cobras (Caja, Mesas, pedidos online pagados y cobros al entregar);
- imprime en el ticket el QR de Hacienda y la leyenda «VERI*FACTU»;
- si cancelas un pedido facturado, hace sola su factura rectificativa;
- envía cada factura a Hacienda.
Las facturas no se pueden borrar ni cambiar. Un pedido sin cobrar no se factura.

## Activar VeriFactu

Solo el gerente.
1. Completa la razón social y el NIF en Configuración → Información del negocio.
2. Ve a Configuración → Facturación · VeriFactu y activa «Emitir facturas VeriFactu».
3. En «Entorno y numeración», elige «Pruebas» o «Producción (facturas reales)» y, si quieres, la «Letra de la serie».
4. Toca «Guardar» en la barra «Cambios sin guardar» que aparece abajo.
Consejo: prueba primero en «Pruebas» y consulta con tu asesor antes de pasar a «Producción».

## Subir el certificado digital para enviar a Hacienda

1. En Configuración → Facturación · VeriFactu, apartado «Envío a Hacienda», toca «Elegir archivo» y elige el certificado (.p12 o .pfx; suele tenerlo tu gestor).
2. Escribe su contraseña y toca «Guardar certificado». La contraseña no se guarda.
3. Verás a nombre de quién está. Si caduca en menos de 30 días, te avisará para renovarlo.
Con «Cambiar» subes otro y con «Quitar» lo borras (las facturas nuevas quedarán pendientes de envío).

## ¿Se han enviado mis facturas a Hacienda?

En Configuración → Facturación · VeriFactu, «Envío a Hacienda» indica cuántas facturas están pendientes o «✓ Todo enviado».
Cada factura se envía sola al hacerse; si algo falla, queda guardada y sale en el siguiente envío. Puedes forzarlo con «Enviar ahora».
En «Registro de facturación», la columna «Hacienda» muestra si cada una está «Aceptada», «Aceptada con errores», «Rechazada» o «Pendiente de envío».

## Hacienda ha rechazado una factura o hay facturas pendientes

- Si pone «Falta la razón social y el NIF del restaurante», complétalos en Configuración → Información del negocio.
- Si falta el certificado, súbelo (ver «Subir el certificado digital…»).
- Si pone «Falta la declaración responsable del programa», no depende de ti: contacta con soporte de NorApp.
- Para una factura rechazada, mira el motivo en el «Registro de facturación» y consúltalo con tu gestor.

## Descargar el registro de facturas para la gestoría

En Configuración → Facturación · VeriFactu, en «Registro de facturación», toca «Descargar registro completo (CSV)». Se abre con Excel.
Ahí también ves las últimas 50 facturas y el estado de la cadena («✓ Cadena íntegra · N registros»).
El detalle y la descarga solo los ve quien tiene el permiso «Ve lo recaudado».
