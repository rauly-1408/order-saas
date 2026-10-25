# 🧮 Módulo "Costes y Margen" (add-on de pago)

> Producto aparte dentro de order-saas, vendible como paquete opcional por restaurante.
> Referencia funcional: **Tavola** (paridad completa) + mejoras propias que solo nosotros podemos hacer
> porque **somos la fuente de las ventas**. Plan creado: 2026-10-14.

---

## 🎯 Propuesta de valor

> *"Sabe cuánto ganas en cada plato y en cada pedido — de verdad, con el pan, la guarnición, la tarjeta y la comisión incluidos — y deja que la app te diga qué comprar y qué precio poner."*

## 🔍 Paridad con Tavola (información pública, octubre 2026)

| Plan Tavola | Precio | Funciones | Nosotros |
|---|---|---|---|
| Gratis | 0 € | Escandallos, ingredientes y proveedores ilimitados; análisis de coste de receta; agente IA | Fase 1 + Fase 4 (IA) |
| Pro | 45 €/mes | Pedidos a proveedores sin listas manuales; inventario siempre visible; motor de precios para no vender por debajo del coste; platos más rentables | Fases 2-3 |
| Elite | 75 €/mes | Previsión de demanda; integración TPV; inventario teórico (mermas y robos); automatización de tareas | Fases 2-4 (sin necesidad de TPV) |
| Otros | — | Inventario por voz; subida de albaranes/facturas estructurados por IA | Fases 2 y 4 |

## ⭐ Mejoras sobre Tavola

| # | Deficiencia en Tavola | Nuestra mejora |
|---|---|---|
| 1 | Necesita integración TPV (solo plan Elite, 3 TPV) para conocer las ventas | **Las ventas ya están dentro**: inventario teórico y rentabilidad real en todos los planes |
| 2 | Coste por plato, sin evidencia pública de coste por opción | **Escandallo por opción** (pan, guarnición, salsas, doble): coste y margen exactos de cada línea de pedido |
| 3 | Margen bruto de receta | **Margen neto por pedido**: resta comisión de la plataforma, tarifa de tarjeta y coste de envío |
| 4 | El motor de precios avisa | **Actúa**: precio sugerido y aplicación en la carta con un clic (la carta es nuestra) |
| 5 | Stock y carta separados | **Agotado automático**: si un ingrediente se acaba, el plato se marca no disponible en la carta |
| 6 | — | **Alérgenos** derivados del escandallo y mostrados en la carta del cliente (obligación UE 1169/2011) |
| 7 | — | **Sinergia con Retención**: las campañas de WhatsApp priorizan platos de alto margen |
| 8 | Reparto del proveedor en texto libre ("Entregas los lunes por la mañana") interpretado para estimar la fecha | **Reparto estructurado**: días de entrega + antelación + hora límite → **próxima entrega exacta**, en el mensaje del pedido y guardada en el pedido (`expectedAt`) |
| 9 | — | **Pedido mínimo del proveedor** con aviso al preparar el pedido ("te faltan X €") |

## 🧱 Fases

### Fase 1 — Escandallos y margen (MVP vendible) ✅ HECHA 2026-10-14 (rama `feat/modulo-costes`)
- Interruptor de módulos por restaurante (`Tenant.addons`): sin el módulo, el panel muestra la pantalla de "Contratar".
- **Proveedores**: nombre, contacto, teléfono, email.
- **Ingredientes**: unidad base (kg, g, l, ml, unidad), precio de compra por formato (p. ej. 12,50 € la caja de 5 kg), proveedor, **% de merma**, alérgenos.
  - Cada alérgeno tiene un **icono redondo** (`costes/AllergenIcon.tsx`) con los colores del panel: verde de marca, rojo de acento y tono cálido. Se ve en los chips del formulario y en la lista de ingredientes (con el nombre al pasar el ratón).
- **Escandallo** de cada producto y de cada opción de modificador: ingredientes y cantidades.
- **Rentabilidad**: coste, precio de venta, margen € y %, food cost %; semáforo por umbral configurable; ranking de platos.
- **Margen real de pedidos** (mejora 2 y 3) con las ventas existentes.

### Fase 2 — Inventario ✅ HECHA 2026-10-15 (rama `feat/costes-inventario`)
- Stock por ingrediente; **descuento automático con cada pedido** (incluidas opciones); recuentos manuales.
- **Inventario teórico vs. real** → mermas y descuadres.
- Avisos de stock bajo; **agotado automático** en la carta (mejora 5).
- Entrada de stock al recibir mercancía.

### Fase 3 — Compras y precios ✅ HECHA 2026-10-15 (rama `feat/costes-compras`)
- Pedidos a proveedores generados desde el stock mínimo (email / WhatsApp al proveedor).
- Historial de precios de compra por ingrediente; aviso cuando sube un proveedor.
- **Motor de precios**: precio sugerido para un margen objetivo y aplicación en la carta con un clic (mejora 4).
- Alérgenos en la carta del cliente (mejora 6).

### Ficha de proveedor completa ✅ 2026-10-16 (rama `feat/costes-ficha-proveedor`)
- Teléfono y **WhatsApp por separado** (si no hay WhatsApp se usa el teléfono), email principal + **hasta 5 en copia** (van en `cc` del email del pedido).
- **Método de pedido preferido** (WhatsApp / Email / Teléfono / En persona): su botón va primero y destacado en Compras; "Llamar" abre `tel:`.
- **Reparto** (mejora 8) y **pedido mínimo** (mejora 9).
- Migración `20261016100000_supplier_profile` (solo añade columnas y el enum `SupplierOrderMethod`).
- Pendiente (necesita proveedor de email): enviar el pedido por email automáticamente, sin abrir el cliente de correo.

### Fase 4 — IA 🔄 en curso
- ✅ **Albaranes y facturas** (2026-10-16): en Compras, "📷 Hacer foto o subir" (foto JPG/PNG/WebP o PDF ≤ 4 MB; las fotos se reducen en el móvil a 2000 px). Claude Opus 5.5 lee proveedor, nº, fecha y líneas, relaciona cada línea con un ingrediente del restaurante y convierte la cantidad a su unidad base y el precio (sin IVA) a su formato de compra. Pantalla de revisión línea a línea con % de cambio de precio, aviso si cantidad × precio no cuadra con el importe y notas de la IA (abonos, IVA incluido…). "Aplicar" = entrada de stock (`RECEIPT`, nota "Albarán nº … de …") + nuevo precio con historial (`IngredientPriceChange` origen `RECEIPT`), la misma lógica que recibir un pedido. Sin migración. Límite: 20 lecturas al día por restaurante. **Ingredientes nuevos (2026-10-20)**: las líneas que no corresponden a ningún ingrediente llegan con una propuesta (nombre, unidad base, formato de compra, precio sin IVA y alérgenos evidentes) que se revisa y se da de alta al aplicar, con el proveedor del albarán; si el proveedor no existe, se ofrece crearlo. Por eso ya se puede leer un albarán sin tener ingredientes dados de alta. Código: `lib/invoice.ts` (puro), `lib/invoiceScan.ts` (IA), `costs/invoice-scan` y `costs/invoice-apply`.
- ✅ **Facturas con IVA y unidades tal cual (2026-10-25)**: cada línea guarda lo que pone el documento (unidades, precio sin IVA con sus decimales, tipo de IVA e importe con IVA) además de la conversión al stock, así se reconoce lo comprado (p. ej. «12 HUEVOS: 1 ud.» → 12 huevos al stock). Se leen todas las líneas, también las que no son ingrediente (limpieza, bolsas, parking…), marcadas como **gasto**: cuentan en la factura y el IVA pero no entran al stock (botón «Es un ingrediente / No es ingrediente»). Se leen base, IVA por tipo y total, y la revisión comprueba que **las líneas suman la factura** («✓ Las 53 líneas suman lo mismo que la factura» o cuánto falta). Una factura que agrupa varios tickets (Mercadona) se lee entera. Al guardar queda registrada en **Facturas de proveedor** (`SupplierInvoice`, migración `20261025180000_supplier_invoices`): gasto por mes con base e **IVA soportado** para la gestoría y cada factura desplegable con sus líneas. La misma factura (proveedor + nº) no se puede aplicar dos veces. El coste de los escandallos sigue siendo **sin IVA** (el IVA soportado se deduce). Lectura en directo (stream, hasta 32 000 tokens, máx. 300 s). Código: `lib/invoice.ts` (`invoiceCheck`, `vatFromLines`, `sanitizeInvoiceRecord`), `costs/invoices`, `costes/FacturasProveedor.tsx`.
- **Asistente**: preguntas en lenguaje natural ("¿qué plato me deja menos margen?", "¿qué pido mañana?").
- **Previsión de demanda** por día de la semana a partir del histórico de pedidos.
- Inventario por voz.

## 💶 Precio (orientativo, a decidir)

| Paquete | Incluye | Referencia Tavola |
|---|---|---|
| Costes Básico | Fase 1 | Gratis en Tavola → valorar incluirlo gratis como gancho |
| Costes Pro | Fases 2-3 | 45 €/mes |
| Costes Elite | Fase 4 | 75 €/mes |

Ventaja de venta: **Tavola cobra 75 €/mes por conectarse al TPV**; nosotros ya tenemos las ventas sin integración.

## 🗄️ Modelo de datos (Fase 1)

- `Tenant.addons: Addon[]` (enum `Addon { COSTS, RETENTION }`).
- `Supplier { tenantId, name, contactName?, phone?, email?, notes? }`
- `Ingredient { tenantId, supplierId?, name, baseUnit (KG|G|L|ML|UNIT), packSize, packPriceCents, wastePct, allergens[] }`
  → coste por unidad base = `packPriceCents / packSize`, ajustado por merma.
- `RecipeLine { tenantId, ingredientId, quantity, productId? | modifierOptionId? }` → escandallo de un producto **o** de una opción.

## ✅ Definition of Done (Fase 1) — cumplida y verificada en local

1. Un restaurante sin el módulo ve "Costes" en el menú con la pantalla de contratar; con el módulo, ve las pantallas.
2. Se pueden crear proveedores e ingredientes y escandallar un mollete (con su pan) y la opción "Boniato".
3. La pantalla de rentabilidad muestra coste, margen y food cost por plato, con semáforo.
4. Se ve el margen real de un pedido existente con sus opciones.
5. APIs protegidas (dueño/superadmin + módulo activo) y verificación móvil de todas las páginas.

## Fuentes
- [Tavola — precios](https://tavola.app/es/precios) · [pricing.md](https://tavola.app/pricing.md)
- [Tavola en GetApp](https://www.getapp.com/all-software/a/tavola/) · [Capterra](https://www.capterra.com/p/10044095/Tavola/)

## 📝 Notas de implementación (Fase 1)

- Activación: `Tenant.addons` contiene `COSTS`. En local lo activa el seed; en producción se activa a mano por restaurante (pendiente: pantalla de superadmin).
- El coste de un plato en "Rentabilidad" es el **plato típico**: receta base + opción por defecto de cada grupo obligatorio (pan recomendado, guarnición incluida).
- Margen calculado sobre precio **sin IVA (10 %)**.
- Margen de pedidos: casa productos por ID y, si la carta se recargó, por nombre; opciones por grupo + nombre (snapshot del pedido).
- ⚠️ Recargar la carta con el seed borra productos/opciones y, en cascada, sus escandallos.

## 📝 Notas de implementación (Fase 2)

- **Control opcional por ingrediente** (`Ingredient.trackStock`): solo los controlados se descuentan. Una entrada o un recuento lo activan.
- **Descuento automático** al crear el pedido, en la misma transacción (`lib/inventory.ts`): receta base × cantidad + receta de cada opción elegida. Solo si el restaurante tiene `COSTS`.
- **Cancelar** un pedido devuelve su consumo (`ORDER_CANCEL`, idempotente).
- **Movimientos** (`StockMovement`): `ORDER`, `ORDER_CANCEL`, `RECEIPT`, `COUNT`, `WASTE`, con stock resultante y **valor en €** al coste útil del momento. El recuento registra la diferencia con el stock teórico → descuadres (mermas no declaradas, robos, errores).
- **Agotado automático** (`Product.stockOut`, `ModifierOption.stockOut`): un plato u opción se oculta de la carta y la API lo rechaza si algún ingrediente controlado no llega para una unidad; vuelve solo al reponer. Independiente del agotado manual (`isAvailable`).
- Pendiente para fase 3: aviso al dueño (push/WhatsApp) cuando algo se agota o baja del mínimo.

## 📝 Notas de implementación (Fase 3)

- **Pedidos a proveedor** (`PurchaseOrder` + líneas, nº correlativo por restaurante): borrador → enviado → recibido / cancelado.
- **Sugerencia de pedido**: ingredientes controlados en o por debajo del mínimo; se repone hasta el doble del mínimo en formatos completos (`lib/purchasing.ts`).
- **Envío**: el mensaje se redacta solo y se abre en **WhatsApp** (`wa.me`, móviles españoles → +34) o en el **email** del proveedor; enviar marca el pedido como enviado. Sin API de WhatsApp de pago.
- **Recepción**: se corrigen cantidades y precio por formato según el albarán → entrada de stock (`RECEIPT`, nota "Pedido a proveedor nº N") y, si el precio cambió, se actualiza el ingrediente.
- **Historial de precios** (`IngredientPriceChange`): se registra al editar un precio o al recibir con otro precio, **solo si cambia el coste por unidad** (1 kg a 12 € → 2 kg a 24 € no es subida). La pantalla muestra el % y a cuántos platos afecta.
- **Aplicar precio sugerido** desde Rentabilidad: cambia el precio base en la carta (restando los suplementos de las opciones por defecto), con confirmación.
- **Alérgenos en la carta del cliente**: unión de los alérgenos de los ingredientes del escandallo, por plato y por opción. Solo aparecen si hay escandallo.
- Un proveedor con pedidos no se puede borrar (es historial de compras).


## 📝 Pantalla (revisión 2026-10-24)

- **Primeros pasos**: arriba de Costes, una guía con el orden recomendado (proveedores → ingredientes con precio → escandallos → control de stock). Cada paso lleva a su pestaña, el siguiente pendiente va resaltado y la guía desaparece cuando están los cuatro.
- **Inventario vacío**: botón «Ir a ingredientes», igual que en Escandallos.
- **Proveedores e Ingredientes**: cada fila se toca para editarla (como la Carta). Mientras se edita se oculta la lista y la pantalla va al formulario. «Borrar» está dentro de la edición.
