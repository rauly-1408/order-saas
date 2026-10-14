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

## 🧱 Fases

### Fase 1 — Escandallos y margen (MVP vendible) ✅ HECHA 2026-10-14 (rama `feat/modulo-costes`)
- Interruptor de módulos por restaurante (`Tenant.addons`): sin el módulo, el panel muestra la pantalla de "Contratar".
- **Proveedores**: nombre, contacto, teléfono, email.
- **Ingredientes**: unidad base (kg, g, l, ml, unidad), precio de compra por formato (p. ej. 12,50 € la caja de 5 kg), proveedor, **% de merma**, alérgenos.
- **Escandallo** de cada producto y de cada opción de modificador: ingredientes y cantidades.
- **Rentabilidad**: coste, precio de venta, margen € y %, food cost %; semáforo por umbral configurable; ranking de platos.
- **Margen real de pedidos** (mejora 2 y 3) con las ventas existentes.

### Fase 2 — Inventario
- Stock por ingrediente; **descuento automático con cada pedido** (incluidas opciones); recuentos manuales.
- **Inventario teórico vs. real** → mermas y descuadres.
- Avisos de stock bajo; **agotado automático** en la carta (mejora 5).
- Entrada de stock al recibir mercancía.

### Fase 3 — Compras y precios
- Pedidos a proveedores generados desde el stock mínimo (email / WhatsApp al proveedor).
- Historial de precios de compra por ingrediente; aviso cuando sube un proveedor.
- **Motor de precios**: precio sugerido para un margen objetivo y aplicación en la carta con un clic (mejora 4).
- Alérgenos en la carta del cliente (mejora 6).

### Fase 4 — IA
- **Albaranes y facturas**: foto → IA extrae proveedor, ingredientes, cantidades y precios → actualiza costes y stock.
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

