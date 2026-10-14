# 🔍 Análisis competitivo — Last.app (pricing de Last Shop)

> Fecha: 2026-10-14 · Fuente: artículo oficial de Last.app del 18-09-2026 (enlace al final).
> Confirmado por el equipo: la comisión de Last Shop **no incluye** el coste de procesar la tarjeta.

---

## Pricing de Last Shop (desde 5-10-2026 para tiendas existentes)

- **Comisión por pedido**: desde **4 % + 0,20 €** por venta (sin cambios respecto al modelo anterior). **No incluye la tarjeta.**
- **Nueva cuota fija por local**, según lo cobrado con tarjeta en la Shop en el periodo:

| Cobrado con tarjeta | Cuota |
|---|---|
| 0 € | 40 € |
| 250 € | 30 € |
| 500 € | 20 € |
| 750 € | 10 € |
| ≥ 1.000 € | 0 € |

- Se calcula **por local**, no por cuenta. **El efectivo no cuenta** para el volumen.
- Nuevas Shop desde 5-09-2026; Shop existentes desde 5-10-2026 (primer cargo 5-11-2026).
- El titular "vende más, paga menos" solo se cumple por encima de 1.000 €/mes con tarjeta: **los restaurantes pequeños pagan más**.

## Suscripción de Last.app (página de precios, consultada 2026-10-14)

Precios por local, facturación anual, sin IVA. Instalación: **500 € + IVA** (pago único por local).

| Plan | Cuota mensual | Tienda online |
|---|---|---|
| Starter | 50 € | hasta 40 €/mes + 4 % + 0,20 €/venta |
| Growth | 95 € | hasta 40 €/mes + 4 % + 0,20 €/venta |
| Unlimited | 175 € | hasta 40 €/mes + 4 % + 0,20 €/venta |

- La tienda online aparece incluida en los tres planes (con su comisión y cuota). La página **no indica que pueda contratarse sin la suscripción** del TPV.
- Su web se contradice: la ficha del producto dice "Gratis" / "sin comisiones" y la tabla de planes muestra la comisión. **Confirmar con presupuesto.**
- Otros cargos: QR "hasta 25 €/mes + 4 % + 0,20 €/venta"; pedidos de delivery 0,25 € (Starter) / 0,19 € (Growth).
- Matiz: la suscripción paga un **TPV completo**. Para quien ya usa Last como caja, la tienda online es un añadido; para quien tiene otro TPV, contratar Last implica cambiar de caja.

## Comparativa con order-saas (3 % + tarjeta aparte, sin cuota)

Tarifa de tarjeta estimada (Stripe, tarjeta europea): ~1,4 % + 0,25 €. Verificar tarifas vigentes.

**Pedido de 20 €**

| | Comisión | Tarjeta | Total | Cuota |
|---|---|---|---|---|
| Last.app | 1,00 € | ~0,53 € | **~1,53 €** | hasta 40 €/local |
| order-saas | 0,60 € | ~0,53 € | **~1,13 €** | 0 € |

**Restaurante pequeño: 600 €/mes con tarjeta (30 pedidos de 20 €)**

| | Coste mensual |
|---|---|
| Last.app | 30 × 1,53 € + 20 € cuota ≈ **66 €** |
| order-saas | 30 × 1,13 € ≈ **34 €** |

**Incluyendo suscripción (plan Starter) y alta:**

| | Last.app Starter | order-saas |
|---|---|---|
| Suscripción | 50 € | 0 € |
| Cuota tienda online | 20 € | 0 € |
| Comisiones + tarjeta | ~46 € | ~34 € |
| **Total mensual** | **~116 €** | **~34 €** |
| Alta | 500 € | 0 € |

## Conclusiones

1. **Mantener 3 % por pedido online + tarjeta aparte (direct charge), sin cuota fija ni alta.** ≈ 26 % más barato por pedido que Last Shop y sin cuota.
2. **Mensaje comercial**: *"Sin cuotas fijas: solo pagas cuando vendes"*, dirigido a restaurantes independientes que con el nuevo pricing de Last pagan más.
3. **Pedidos "pagar en el local": 0 %** (Last tampoco cuenta el efectivo para su volumen, pero sí cobra la cuota).
4. **Público objetivo**: restaurantes con **otro TPV** (Ágora, Revo…) que quieren pedido online + retención sin cambiar de caja, y restaurantes pequeños que no quieren cuotas fijas.
5. **Modelo propio**: pedido online sin cuota (solo 3 %) para entrar; suscripción futura por el **motor de retención** (Sprint 3) cuando el restaurante vea resultados.
6. La comisión es configurable por restaurante (`Tenant.platformFeeBps`): margen para pilotos o negociación.

## Fuente

- [Last.app — Precios y planes](https://www.last.app/precios)
- [Last.app — El nuevo pricing de Last Shop: vende más, paga menos (18-09-2026)](https://www.last.app/actualizaciones-de-producto/el-nuevo-pricing-de-last-shop-vende-mas-paga-menos)
