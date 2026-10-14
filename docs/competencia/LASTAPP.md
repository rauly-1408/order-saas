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

## Conclusiones

1. **Mantener 3 % por pedido online + tarjeta aparte (direct charge), sin cuota fija ni alta.** ≈ 26 % más barato por pedido que Last Shop y sin cuota.
2. **Mensaje comercial**: *"Sin cuotas fijas: solo pagas cuando vendes"*, dirigido a restaurantes independientes que con el nuevo pricing de Last pagan más.
3. **Pedidos "pagar en el local": 0 %** (Last tampoco cuenta el efectivo para su volumen, pero sí cobra la cuota).
4. La comisión es configurable por restaurante (`Tenant.platformFeeBps`): margen para pilotos o negociación.

## Fuente

- [Last.app — El nuevo pricing de Last Shop: vende más, paga menos (18-09-2026)](https://www.last.app/actualizaciones-de-producto/el-nuevo-pricing-de-last-shop-vende-mas-paga-menos)
