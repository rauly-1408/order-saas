# 🗺️ ROADMAP — order-saas

> Documento vivo. Actualizado al inicio de cada sprint.  
> Última actualización: 2026-10-14

---

## 🎯 Misión

Construir la plataforma de gestión de pedidos online más rápida de implementar y más fácil de usar para restaurantes en España y LATAM — superando las limitaciones de Last.app, Otter y plataformas similares.

**Tesis competitiva (2026-05-22):** no competimos con TPVs/ERP como Ágora (otra categoría). Competimos en el **pedido online directo**, y ganamos no por tener más features de operativa, sino por ser el **motor de retención y marketing** que le devuelve al restaurante la propiedad de su cliente. Ese es el terreno donde tenemos ventaja injusta y donde Last.app no juega.

---

## 📊 Estado actual del producto

```
Fase: Alpha en pruebas (tenant único: Estafetén, sin clientes reales)
Producción: ✅ https://order-saas-delta.vercel.app (Vercel) + Neon PostgreSQL
Menú online: ✅ Carta real 2026 (50 productos) en cuadrícula, tema por tenant,
             selector de pan (recomendado preseleccionado), guarnición y extras
Checkout: ✅ Teléfono validado, consentimiento de marketing, precios calculados en servidor
Panel admin: ✅ Login + sesión por tenant; barra lateral (Inicio, Pedidos, Informes, Clientes,
             Carta, Costes, Personalización, Configuración); kanban de pedidos con sonido; usable en móvil
Informes: ✅ Ventas vs periodo anterior, lo más vendido, horas punta, canal, cupones y CSV para Excel
Pagos: ✅ Pasarela de cada restaurante (Redsys/Bizum, Stripe) + pago en el local — ver PAGOS.md
CRM / retención: ✅ Clientes, segmentos, cupones, campañas WhatsApp manuales con texto IA, atribución,
             promociones automáticas y tarjeta de fidelidad — Business API pendiente
Base de datos: ✅ Migraciones Prisma con baseline (0_init); nunca `db push` contra Neon
```

---

## 📦 Productos y módulos

| Módulo | Modelo de cobro | Estado |
|---|---|---|
| Pedidos (base) | 3 % por pedido pagado online; 0 % en "pagar en el local"; sin cuota fija | ✅ Producción |
| Costes y margen | Add-on de pago (referencia Tavola: 0 / 45 / 75 €/mes) | 🔄 Fases 1-3 (escandallos, inventario, compras) — ver [MODULO-COSTES.md](./MODULO-COSTES.md) |
| Retención | Add-on de pago | 🔄 Fase 1 (clientes, cupones, campañas, atribución) — ver [SPRINT-03.md](./SPRINT-03.md) |
| TPV propio | — | 🅿️ Aparcado (ver backlog) |

Los módulos se activan por restaurante (`Tenant.addons`).

---

## 🏁 Sprints

> Reordenado el 2026-05-22 tras el análisis competitivo (Ágora / Last.app).
> Orden lógico: primero *vendible* (loop + auth + cobro), luego el *diferenciador* (retención), luego *fricción/ops*.
> El motor de retención es el sprint estrella, no un nice-to-have.

### Sprint 1 — El ciclo mínimo viable ✅ COMPLETADO (2026-10-14)
**Objetivo**: Que un cliente pueda hacer un pedido y el dueño pueda verlo y gestionarlo.  
**Duración estimada**: 2 semanas  
**Fecha inicio**: 2026-05-20  
**Ver detalle**: [SPRINT-01.md](./SPRINT-01.md)

Entregables:
- [x] Checkout completo con datos del cliente (nombre, teléfono, notas)
- [x] Capturar **consentimiento de marketing** en el checkout (requisito legal previo a la retención)
- [x] API POST /api/orders/[tenant] — crear pedido en DB
- [x] Panel /admin/[tenant] — vista en tiempo real de pedidos activos
- [x] Cambio de estado de pedido (Nuevo → Preparando → Listo → Entregado)
- [x] Notificación sonora en panel cuando llega pedido nuevo
- [x] Fix precios 0.00 € en menú del cliente

---

### Sprint 2 — Vendible: autenticación + cobro 🔄 EN CURSO (plan 2026-10-14)
**Objetivo**: Cerrar los bloqueantes que hoy impiden tener un cliente real pagando.  
**Duración estimada**: 2 semanas  
**Ver detalle**: [SPRINT-02.md](./SPRINT-02.md)

Entregables:
- [x] **Autenticación del panel admin** (login + sesión JWT + scoping por tenant — adelantado en la rama del Sprint 1)
- [x] Permisos por rol (SUPERADMIN / TENANT_ADMIN / STORE_MANAGER) — `STORE_MANAGER` solo Pedidos
- [ ] **Pago online con Stripe Connect** — el restaurante es el *merchant of record* (el dinero entra a su cuenta; nosotros cobramos un fee de SaaS por encima)
- [ ] Validar el modelo fiscal con un asesor antes del primer cliente (ver Decisiones técnicas)

---

### Sprint 3 — ⭐ Motor de retención (EL DIFERENCIADOR) 🔄 FASE 1 COMPLETADA (2026-10-16)
**Objetivo**: Lo que Last.app no tiene. Devolverle al restaurante la propiedad del cliente y hacerlo volver solo.  
**Duración estimada**: 3 semanas  
**Ver detalle**: [SPRINT-03.md](./SPRINT-03.md)

Entregables:
- [x] Upsert de `Customer` (clave: tenant + teléfono) al confirmar cada pedido, con métricas agregadas
- [x] Segmentación automática: NEW / REGULAR / VIP / AT_RISK (se recalcula con la fecha actual al abrir Clientes y al crear campañas)
- [x] Campañas por segmento (`Campaign` + `CampaignSend`) con dedupe por cliente y máximo 1 por semana
- [~] Envío por **WhatsApp**: manual asistido (`wa.me`) hecho; Business API en fase 2, cuando exista la cuenta
- [x] Cupones de retención (`Coupon`) vinculados a campaña, creados en 1 click y aplicables en el checkout
- [ ] **IA que redacta la promo** según segmento y contexto del negocio
- [x] Atribución: marcar `CampaignSend` como CONVERTED cuando el cliente vuelve a pedir (14 días)

---

### Sprint 4 — Gestión sin fricción 🔶 PARCIALMENTE ADELANTADO
**Objetivo**: Que el dueño gestione su negocio en segundos, mobile-first.  
**Duración estimada**: 2 semanas  
**Ver detalle**: [SPRINT-04.md](./SPRINT-04.md) (incluye TASK-011..017, antes llamado SPRINT-02)

Entregables:
- [~] Editor de menú en una sola pantalla (toggle disponibilidad, editar precio) — pantalla Carta del panel hecha en mayo; falta validar E2E y edición de opciones (pan/guarnición)
- [ ] Toggle "86" — marcar producto agotado en 1 tap
- [ ] Rediseño completo del menú del cliente (fotos, layout mobile-first)
- [x] Informes de ventas (2026-10-16): cifras vs periodo anterior, ventas por día, productos y categorías, horas punta, domicilio/recogida, cupones y exportación a Excel — ver [INFORMES.md](./INFORMES.md)
- [ ] Dashboard con alertas inteligentes ("hoy vas 30% por debajo del martes pasado")
- [ ] Onboarding guiado de 5 pasos (nuevo tenant en < 15 min)

---

### Sprint 5 — Paridad operativa ⏳ PENDIENTE
**Objetivo**: Cerrar la brecha de operación con los competidores grandes.  
**Duración estimada**: 2-3 semanas  
**Ver detalle**: [SPRINT-05.md](./SPRINT-05.md)

Entregables:
- [ ] KDS (Kitchen Display System) — pantalla de cocina en tiempo real
- [ ] Multi-canal: conectar Glovo / JustEat vía webhooks
- [ ] Resumen semanal con IA (narrativa automática de rendimiento)
- [ ] Modo tablet optimizado para cocina

---

### 🧾 Track aparte — "Subir a sistema de registro" (sin fecha; cuando haya volumen)
**No es un sprint planificado.** Hoy el restaurante emite su propio ticket fiscal y nosotros somos el *canal* (no el sistema de registro), lo que nos saca de encima la carga de VeriFactu en el MVP.

VeriFactu fue **aplazado** por el RD-ley 15/2025: entra en vigor el **1 de enero de 2027 (sociedades)** y el **1 de julio de 2027 (autónomos)** → hay margen de sobra y no bloquea el lanzamiento.

Cuando el volumen lo justifique, evaluar un módulo de facturación compatible con RRSIF (hash encadenado, registro de eventos, QR, exportación) para poder ser nosotros el emisor del documento fiscal.

---

## 🔮 Backlog futuro (post-MVP)

- **Programa de fidelización**: puntos, sellos digitales, recompensas
- **Chatbot de pedidos por WhatsApp**: tomar pedidos directamente por WhatsApp Business
- **Inventario básico**: alertar cuando un ingrediente clave baja de stock
- **Multi-location**: gestionar varios locales desde un único dashboard
- **App nativa iOS/Android** para el panel del dueño
- **Marketplace**: los clientes buscan restaurantes cercanos dentro de la plataforma
- **Integración TPV físico**: sincronizar pedidos online con caja registradora
- **TPV propio (aparcado 2026-10-14)**: se valoró construir TPV + app de pedidos y cobrar como Last.app (suscripción + instalación). Aparcado por: obligación VeriFactu para sistemas de facturación (sociedades 1-1-2027, autónomos 1-7-2027), meses de desarrollo (sala, comandas, impresoras, offline, cierres de caja) y mercado saturado. Retomar solo con validación fiscal y como línea de producto separada.

---

## 📐 Principios de diseño

1. **Speed to value**: El restaurante hace su primer pedido en < 15 minutos desde el registro
2. **Mobile-first**: El 80% de los pedidos vienen de móvil — diseñamos ahí primero
3. **One-tap actions**: Las acciones más frecuentes (agotado, cambio de estado) con el mínimo de pasos
4. **Datos con narrativa**: No mostramos números solos — siempre con contexto y acción sugerida
5. **Sin lock-in**: Exportación de datos siempre disponible
6. **El cliente es del restaurante**: nunca nos interponemos en su relación con su comensal — se la potenciamos

---

## 🛠️ Decisiones técnicas registradas

| Fecha | Decisión | Razón |
|-------|----------|-------|
| 2026-05-20 | Usar Server-Sent Events para realtime | WebSockets más costoso en Vercel; SSE suficiente para volumen inicial |
| 2026-05-20 | Neon PostgreSQL serverless | Compatible con Vercel Edge, free tier generoso, connection pooling automático |
| 2026-05-20 | No usar component library | Tailwind custom = control total del diseño diferenciador |
| 2026-05-20 | Zustand para carrito | Ligero, sin boilerplate, persiste en localStorage nativamente |
| 2026-05-20 | Pago contra entrega primero | Lanzaba más rápido — *superado por la decisión del 2026-05-22 (Stripe Connect en Sprint 2)* |
| 2026-05-22 | Restaurante como *merchant of record* (Stripe Connect) | El ticket fiscal lo emite el restaurante → nos saca de encima VeriFactu en el MVP; menor riesgo legal. Validar con asesor fiscal antes del primer cliente |
| 2026-05-22 | Motor de retención WhatsApp-first como diferenciador central | Es terreno de marketing automation (ventaja del fundador), no copiable por Last.app en su cancha de operativa |
| 2026-05-22 | Stripe movido de Sprint 4 → Sprint 2 | El cobro es bloqueante de "vendible", no una feature tardía |
| 2026-05-22 | CRM en tablas propias (Customer/Coupon/Campaign/CampaignSend) | El JSON suelto no sirve para segmentar ni medir conversión; la retención necesita relaciones reales |
| 2026-10-14 | Precios de pedido calculados en el servidor desde la carta | El navegador podía enviar cualquier precio (incl. 0 €); con modificadores era imprescindible |
| 2026-10-14 | Baseline de migraciones (`0_init`) y `migrate deploy` en producción | Neon se gestionaba con `db push` y el historial no reflejaba la base real |
| 2026-10-14 | Integración de las dos líneas de mayo: panel con barra lateral de main + login, CRM, kanban y opciones | Había dos ramas divergentes; main desplegado no tenía login y sus rutas /api/admin estaban abiertas |
| 2026-10-14 | Menú cliente con tema por tenant (se descarta el diseño con colores fijos estilo BK) | Plataforma multi-restaurante: la marca es de cada tenant; sin fotos el diseño BK mostraba "?" |
| 2026-10-14 | Comisión 3 % por pedido online, tarjeta aparte, sin cuota fija | Last Shop cobra 4 % + 0,20 € sin tarjeta + cuota hasta 40 €/local + suscripción TPV desde 50 €/mes y 500 € de alta (ver docs/competencia/) |
| 2026-10-14 | TPV propio aparcado | VeriFactu, coste de desarrollo y mercado saturado; competimos en pedido directo + retención |
| 2026-10-14 | Producción = proyecto Vercel `order-saas` (order-saas-delta.vercel.app) | Los proyectos `order-saas-d4a4` y `order-saas-tu7k` son duplicados rotos a eliminar |
| 2026-10-14 | Rediseño "Apple × marca del restaurante" en panel y carta pública | El panel era casi idéntico al de Last.app. Ahora: tipografía de sistema, movimiento suave, tarjetas que se elevan y la identidad de cada tenant (`branding.panel` en el panel; `headingFont`/`headingCase` y texto sobre acento calculado por contraste en la carta) |
| 2026-10-16 | Retención fase 1 con envío manual asistido por WhatsApp (`wa.me`) | Funciona hoy sin cuenta de Business API ni coste por mensaje; el envío automático llega en fase 2 sobre el mismo modelo de datos |
| 2026-10-16 | Funciones de Vercel en Frankfurt (`fra1`, `vercel.json`) | La base de datos (Neon) está en eu-central-1 y las funciones corrían en Washington (iad1): cada consulta cruzaba el Atlántico |
| 2026-10-16 | Panel instalable (PWA) y aviso de pedidos global | Los navegadores bloquean el sonido hasta tocar la página; instalada como app puede sonar siempre. El aviso ("cha-ching" sintetizado, suena una vez por pedido nuevo) funciona en cualquier pestaña del panel |
| 2026-10-16 | El aviso repite el "cha-ching" cada ~8 s mientras haya pedidos sin aceptar; interruptor «Repetir hasta aceptar / Sonar una vez» en Pedidos (por defecto, repetir) | Lo pidió un restaurante de prueba para no perder pedidos. Para al aceptarlos y nunca suena sin pedidos pendientes (el fallo de antes) |
| 2026-10-16 | Horario, cierres, pausa, tiempo extra y zonas de reparto por código postal (ver HORARIOS-Y-ZONAS.md) | Paridad con Last.app en lo imprescindible para abrir la tienda al público; el local (`Store`) es la única referencia operativa y el servidor valida todo |
| 2026-10-16 | Informes de ventas en el producto base (sin módulo de pago) y solo para gerentes (ver INFORMES.md) | Es lo mínimo que espera cualquier restaurante (Last.app lo tiene); se calcula al vuelo desde `Order` en la hora del restaurante, sin tablas nuevas ni migración |
| 2026-10-16 | Promociones automáticas sin código y tarjeta de fidelidad por teléfono (ver PROMOCIONES-Y-FIDELIZACION.md) | Paridad con Last.app en promociones; el premio por sellos es la palanca de recurrencia más simple. No se acumulan con cupones: gana el mayor ahorro |
| 2026-10-16 | Personalización completa al nivel de Last.app: favicon, 3 logotipos, portada, paleta con vista previa, fuentes de Google y presencia online (ver PERSONALIZACION.md) | Imágenes guardadas en la propia base de datos (tabla `BrandAsset`), comprimidas en el navegador: sin proveedor externo ni claves nuevas mientras el volumen sea pequeño |
| 2026-10-16 | Combos / menús a precio cerrado con pasos y suplementos (ver COMBOS.md) | Subir el ticket medio como Last.app. El combo es un producto más (pedidos, informes y carta sin cambios); el stock sale de lo elegido |
| 2026-10-17 | Pedidos programados (también con la tienda cerrada) y dirección con sugerencias de CartoCiudad (ver PEDIDOS-PROGRAMADOS.md) | No perder pedidos fuera de horario. Direcciones sin clave ni coste (IGN); Google Places cuando el restaurante tenga su clave |
| 2026-10-17 | Rediseño de la tienda pública al estilo de las grandes cadenas: portada a todo lo ancho, cabecera sólida con carrito, promociones y menús con tarjetas propias, animaciones al hacer scroll (ver TIENDA-DISENO.md) | El dueño veía la tienda «sosa». Cada tipo de tarjeta comunica algo distinto; todo respeta «reducir movimiento» |
| 2026-10-17 | Datos del negocio obligatorios, pie completo de la tienda y textos legales generados (ver DATOS-NEGOCIO-Y-LEGAL.md) | La LSSI obliga a mostrar titular, NIF, domicilio y contacto; con ellos se generan aviso legal, privacidad, cookies y condiciones. Sin analítica no hace falta banner de cookies |
| 2026-10-16 | Reparto con plataformas, fase 1: «Escoge quién te lo lleva» (Glovo / Uber Eats / Just Eat) como McDonald's (ver REPARTO-PLATAFORMAS.md) | Estafetén no tendrá motos propias, igual que las grandes cadenas. Fase 2: pedido en nuestra tienda + repartidor externo (Uber Direct / Glovo On-Demand) para no ceder el cliente ni la comisión |
| 2026-10-17 | Carta en inglés con botón ES / EN y traducción con IA en un clic, revisable a mano en Carta → Idiomas (ver CARTA-IDIOMAS.md) | Granada recibe muchos turistas. La traducción se guarda en cada fila (`translations`), así no se llama a la IA en cada visita; la cocina sigue en español |
| 2026-10-17 | Hora programada con rueda tipo iPhone, cada 5 min | El desplegable cada 15 min era incómodo en el móvil y poco preciso |
| 2026-10-17 | Sección «Entrantes y complementos» de Estafetén y grupo «Añade complementos» en molletes y burgers (también dentro de los menús) | Estaba en la carta real y faltaba en la tienda; sube el ticket medio. Script aditivo `prisma/add-complementos.ts` |
| 2026-10-18 | Pagos online como Shopify: cada restaurante conecta su pasarela (Redsys con Bizum, Stripe o modo prueba); comisión del 3 % apuntada y facturada aparte (ver PAGOS.md). Configuración pasa abajo en la barra lateral, por apartados | Sustituye a Stripe Connect: en España casi todos los restaurantes tienen ya TPV del banco (Redsys) y quieren elegir. El dinero va directo al restaurante (merchant of record) |
| 2026-10-17 | Repartidor externo: Glovo On-Demand y modo prueba; se pide al aceptar el pedido, y el panel y el cliente siguen el viaje (ver REPARTO-EXTERNO.md) | Estafetén no tendrá motos propias. Pedir en nuestra tienda y contratar solo el viaje evita la comisión del 25-35 % y conserva el cliente. Cada restaurante firma con Glovo y el cliente paga el envío fijo de su zona |
| 2026-10-16 | Seguimiento en vivo del pedido, aviso en el navegador y reseñas propias con salto a Google para 4-5★ (ver SEGUIMIENTO-Y-RESENAS.md) | Sin cuentas externas: mejora la experiencia y la nota en Google ya. El aviso por WhatsApp llegará con la Business API |

---

## 📈 Métricas de éxito por sprint

| Sprint | Métrica clave |
|--------|---------------|
| Sprint 1 | 1 pedido real completado de punta a punta — ✅ validado en local el 2026-10-14 |
| Sprint 2 | Primer cobro online procesado (restaurante = merchant of record) |
| Sprint 3 | Primera campaña de retención enviada y ≥ 1 pedido atribuido a ella |
| Sprint 4 | Dueño actualiza su menú en < 2 min; tenant nuevo operativo en < 15 min |
| Sprint 5 | Pedido de Glovo/JustEat entrando por webhook al panel |
