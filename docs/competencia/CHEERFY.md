# 🔍 Análisis competitivo — Cheerfy

> Fecha: 2026-10-14 · Fuentes públicas (web de Cheerfy, Alimarket, Merca2, Dealroom, Built In, VCBacked).
> Varias fuentes son de 2020-2022 y su página de precios ya no está publicada: **verificar con una demo** antes de usar cifras en una venta.

---

## TL;DR

- **Es el competidor que más se parece a nuestra tesis**: pedidos directos + CRM + fidelización en una plataforma.
  Nuestra frase del ROADMAP "Last.app no juega en retención" sigue siendo cierta, pero **Cheerfy sí juega**.
- **Va a cadenas** (200+ marcas: Lizarran, Grosso Napoletano, Healthy Poke, Lateral, Carl's Jr.).
  Los restaurantes independientes y las cadenas pequeñas quedan menos atendidos → **ese es nuestro hueco**.
- **Canales documentados: SMS, email y push. No hay evidencia pública de WhatsApp**, ni de IA, ni de segmentación tipo VIP / en riesgo.
  → Nuestro "WhatsApp-first + IA que redacta la promo + atribución" sigue siendo diferencial **si llegamos pronto**.
- **Precio**: cobran un % de ventas (≈1,9 % a 3,5 % según plan y versión de la página) con mínimos/máximos y **alta de 99 € por marca**.
  → **Nuestro 3 % sin alta está dentro de mercado.**

---

## 1. Empresa

| | |
|---|---|
| Fundadores | Carlos Gómez Vendrell y Adrián Maseda |
| Sede | Londres (opera en Reino Unido y sur de Europa; concepto desarrollado entre Madrid y Londres) |
| Financiación conocida | Seed (Techstars, UK Future Fund, business angels); Dealroom cita ~£265k. Sin rondas recientes públicas |
| Tamaño | "200+ Restaurant Brands" según su web |
| Cliente objetivo | Cadenas (enterprise), no locales individuales |

## 2. Producto

| Módulo | Qué hace |
|---|---|
| **Shop** | Pedidos online: delivery, para llevar y en mesa ("Venue"); diseño personalizado; menús dinámicos; reparto "white label" |
| **CRM & Loyalty** | CRM, tarjeta de fidelización en el **Wallet** del móvil (sin app), cupones, **cashback**, valoraciones, marketing automatizado e individualizado |
| **Pay** | Pago en mesa, dividir cuenta, Apple/Google Pay |
| **Kiosk** | Kioscos de autoservicio multimarca |
| **Places** | Marketplace propio que agrupa las tiendas de varias marcas |
| Integraciones | "100+" (cita Deliverect y Ordatic en planes superiores) |

**Canales de comunicación documentados**: SMS, email, notificaciones push. **WhatsApp: no aparece** en ninguna fuente consultada.

**Resultados que declaran**: "x2-3 visitas por cliente", "+20-40 % ticket medio".

## 3. Precios (versión antigua de su web, a verificar)

| Plan | Comisión | Mín. / máx. mensual | Alta |
|---|---|---|---|
| Shop Starter | 1,9 % de ventas | 19 / 199 por local y marca | 99 por marca |
| Shop Professional | 2,9 % (versión inglesa) · **3,5 %** (versión española) | 29 € / 299 € por local y marca | 99 € por marca |

- Oferta citada: "-33 % de comisión en Shop si se contrata Shop + Loyalty" → **empaquetan la fidelización para retener al cliente en su plataforma**.

## 4. Comparativa con order-saas

| Capacidad | Cheerfy | order-saas hoy | order-saas planificado |
|---|---|---|---|
| Pedidos online (delivery / recoger) | ✅ | ✅ | |
| Selector de opciones (pan, extras) | ✅ (menús dinámicos) | ✅ | |
| Panel de pedidos tiempo real | ✅ | ✅ kanban + sonido | |
| Cobro online | ✅ | ❌ | Sprint 2 (Stripe Connect) |
| Pago en mesa / dividir cuenta | ✅ | ❌ | Backlog |
| Kiosko | ✅ | ❌ | No previsto |
| CRM con ficha de cliente | ✅ | ✅ (Customer + consentimiento) | |
| Segmentación automática (nuevo / habitual / VIP / en riesgo) | ❓ no documentada | ✅ básica | Sprint 3 (job periódico) |
| Tarjeta de fidelidad en Wallet | ✅ | ❌ | Backlog post-MVP |
| Campañas automáticas | ✅ SMS / email / push | ❌ | **Sprint 3: WhatsApp** |
| **WhatsApp** | ❌ no documentado | ❌ | **Sprint 3 (diferencial)** |
| **IA que redacta la promo** | ❌ no documentado | ❌ | **Sprint 3 (diferencial)** |
| **Atribución campaña → pedido** | ❓ declaran resultados, sin detalle | ❌ | **Sprint 3** |
| Onboarding autoservicio < 15 min | ❌ (venta enterprise, alta 99 €) | ⚠️ | Sprint 4 |
| Público | Cadenas | Independientes y cadenas pequeñas | |

## 5. Dónde podemos ganar

1. **Independientes y cadenas pequeñas (1-5 locales).** Cheerfy vende a cadenas con alta por marca y mínimos mensuales; un restaurante como Estafetén queda fuera de su foco.
2. **WhatsApp como canal principal.** En España el cliente de restaurante abre WhatsApp, no el email. Si Cheerfy no lo tiene, es la diferencia más visible en una demo.
3. **El dueño no tiene que pensar la campaña**: segmento automático → la IA propone el mensaje y el cupón → un clic → se mide cuántos volvieron. Cheerfy habla de automatización, pero no de esto.
4. **Precio simple**: 3 % sin alta, sin mínimos para empezar. Comparable o más barato que su plan Professional.
5. **Rapidez de puesta en marcha** (objetivo Sprint 4: tenant nuevo en < 15 min).

## 6. Riesgos

- Tienen **200+ marcas, casos de éxito y producto más completo** (Pay, Kiosk, Wallet). En una cadena mediana ganan ellos.
- Pueden **añadir WhatsApp** en cualquier momento: nuestra ventaja en ese canal es de tiempo, no permanente.
- **Empaquetan** Shop + Loyalty con descuento: si un restaurante ya está con ellos, el coste de cambio es alto.

## 7. Implicaciones para el roadmap

- **Sprint 2 (cobro)**: mantener el 3 % sin cuota de alta; está en rango de mercado.
- **Sprint 3 (retención)** es donde se decide la diferenciación. Prioridad: **WhatsApp + IA que redacta + atribución medible**, en ese orden. Llegar antes de que Cheerfy lo añada.
- **Backlog**: evaluar tarjeta de fidelidad en Wallet (Apple/Google) como "paridad" tras el Sprint 3.
- **Posicionamiento comercial** sugerido: *"El motor de retención por WhatsApp para restaurantes independientes: tus clientes vuelven solos, y te enseñamos cuántos."*

## 8. Pendiente de verificar (pedir demo como restaurante)

- [ ] ¿Tienen WhatsApp hoy (Business API)?
- [ ] ¿Qué segmentaciones automáticas ofrecen?
- [ ] ¿Usan IA para campañas?
- [ ] Precios actuales en España y si atienden a independientes.
- [ ] Qué pasarela de pago usan y quién es *merchant of record*.

---

## Fuentes

- [Web de Cheerfy](https://www.en.cheerfy.com/)
- [Clientes de Cheerfy](https://en.cheerfy.com/customers)
- [Alimarket — Tecnología en fidelización digital de restauración organizada](https://www.alimarket.es/restauracion/noticia/397958/articulo-de-tecnologia-en-fidelizacion-digital-de-restauracion-organizada)
- [Merca2 — Lateral y Cheerfy](https://www.merca2.es/2021/08/10/lateral-cheerfy-restaurantes/)
- [Merca2 — Cheerfy lanza un salvavidas a los restaurantes](https://www.merca2.es/cheerfy-salvavidas-restaurantes-eltenedor)
- [Dealroom — Cheerfy](https://app.dealroom.co/companies/cheerfy)
- [Built In — Cheerfy](https://builtin.com/company/cheerfy)
- [VCBacked — Cheerfy](https://www.vcbacked.co/company/cheerfy)
- Página de precios Cheerfy Shop (ya no publicada; datos vistos en resultados de búsqueda): `en.cheerfy.com/pricing/shop-oculto`
