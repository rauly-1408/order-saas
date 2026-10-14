# 🗺️ ROADMAP — order-saas

> Documento vivo. Actualizado al inicio de cada sprint.  
> Última actualización: 2026-05-22

---

## 🎯 Misión

Construir la plataforma de gestión de pedidos online más rápida de implementar y más fácil de usar para restaurantes en España y LATAM — superando las limitaciones de Last.app, Otter y plataformas similares.

**Tesis competitiva (2026-05-22):** no competimos con TPVs/ERP como Ágora (otra categoría). Competimos en el **pedido online directo**, y ganamos no por tener más features de operativa, sino por ser el **motor de retención y marketing** que le devuelve al restaurante la propiedad de su cliente. Ese es el terreno donde tenemos ventaja injusta y donde Last.app no juega.

---

## 📊 Estado actual del producto

```
Fase: Alpha (tenant único: Estafetén)
Infraestructura: ✅ Next.js 16 + Neon PostgreSQL + Vercel
Menú online: ✅ /pedir/estafeten funcional (diseño básico)
Checkout: ❌ Pendiente Sprint 1
Panel admin: ⚠️ Existe pero SIN autenticación (bloqueante — Sprint 2)
Pagos: ❌ Pendiente Sprint 2 (Stripe Connect)
CRM / retención: ❌ Modelo de datos listo en schema, lógica pendiente (Sprint 3)
```

---

## 🏁 Sprints

> Reordenado el 2026-05-22 tras el análisis competitivo (Ágora / Last.app).
> Orden lógico: primero *vendible* (loop + auth + cobro), luego el *diferenciador* (retención), luego *fricción/ops*.
> El motor de retención es el sprint estrella, no un nice-to-have.

### Sprint 1 — El ciclo mínimo viable ✅ EN CURSO
**Objetivo**: Que un cliente pueda hacer un pedido y el dueño pueda verlo y gestionarlo.  
**Duración estimada**: 2 semanas  
**Fecha inicio**: 2026-05-20  
**Ver detalle**: [SPRINT-01.md](./SPRINT-01.md)

Entregables:
- [ ] Checkout completo con datos del cliente (nombre, teléfono, notas)
- [ ] Capturar **consentimiento de marketing** en el checkout (requisito legal previo a la retención)
- [ ] API POST /api/orders/[tenant] — crear pedido en DB
- [ ] Panel /admin/[tenant] — vista en tiempo real de pedidos activos
- [ ] Cambio de estado de pedido (Nuevo → Preparando → Listo → Entregado)
- [ ] Notificación sonora en panel cuando llega pedido nuevo
- [ ] Fix precios 0.00 € en menú del cliente

---

### Sprint 2 — Vendible: autenticación + cobro ⏳ PENDIENTE
**Objetivo**: Cerrar los bloqueantes que hoy impiden tener un cliente real pagando.  
**Duración estimada**: 2 semanas  
**Ver detalle**: [SPRINT-02.md](./SPRINT-02.md)

Entregables:
- [ ] **Autenticación del panel admin** (hoy `/admin/[tenant]` está abierto a cualquiera — bloqueante)
- [ ] Permisos por rol (SUPERADMIN / TENANT_ADMIN / STORE_MANAGER)
- [ ] **Pago online con Stripe Connect** — el restaurante es el *merchant of record* (el dinero entra a su cuenta; nosotros cobramos un fee de SaaS por encima)
- [ ] Validar el modelo fiscal con un asesor antes del primer cliente (ver Decisiones técnicas)

---

### Sprint 3 — ⭐ Motor de retención (EL DIFERENCIADOR) ⏳ PENDIENTE
**Objetivo**: Lo que Last.app no tiene. Devolverle al restaurante la propiedad del cliente y hacerlo volver solo.  
**Duración estimada**: 3 semanas  
**Ver detalle**: [SPRINT-03.md](./SPRINT-03.md)

Entregables:
- [ ] Upsert de `Customer` (clave: tenant + teléfono) al confirmar cada pedido, con métricas agregadas
- [ ] Segmentación automática: NEW / REGULAR / VIP / AT_RISK
- [ ] Campañas por segmento (`Campaign` + `CampaignSend`) con dedupe por cliente
- [ ] Envío nativo por **WhatsApp** (Business API / Twilio)
- [ ] Cupones de retención (`Coupon`) vinculados a campaña, creados en 1 click
- [ ] **IA que redacta la promo** según segmento y contexto del negocio
- [ ] Atribución: marcar `CampaignSend` como CONVERTED cuando el cliente vuelve a pedir

---

### Sprint 4 — Gestión sin fricción ⏳ PENDIENTE
**Objetivo**: Que el dueño gestione su negocio en segundos, mobile-first.  
**Duración estimada**: 2 semanas  
**Ver detalle**: [SPRINT-04.md](./SPRINT-04.md)

Entregables:
- [ ] Editor de menú en una sola pantalla (toggle disponibilidad, editar precio)
- [ ] Toggle "86" — marcar producto agotado en 1 tap
- [ ] Rediseño completo del menú del cliente (fotos, layout mobile-first)
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

---

## 📈 Métricas de éxito por sprint

| Sprint | Métrica clave |
|--------|---------------|
| Sprint 1 | 1 pedido real completado de punta a punta |
| Sprint 2 | Primer cobro online procesado (restaurante = merchant of record) |
| Sprint 3 | Primera campaña de retención enviada y ≥ 1 pedido atribuido a ella |
| Sprint 4 | Dueño actualiza su menú en < 2 min; tenant nuevo operativo en < 15 min |
| Sprint 5 | Pedido de Glovo/JustEat entrando por webhook al panel |
