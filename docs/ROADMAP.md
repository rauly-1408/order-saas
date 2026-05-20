# 🗺️ ROADMAP — order-saas

> Documento vivo. Actualizado al inicio de cada sprint.  
> Última actualización: 2026-05-20

---

## 🎯 Misión

Construir la plataforma de gestión de pedidos online más rápida de implementar y más fácil de usar para restaurantes en España y LATAM — superando las limitaciones de Last.app, Otter y plataformas similares.

---

## 📊 Estado actual del producto

```
Fase: Alpha (tenant único: Estafetén)
Infraestructura: ✅ Next.js 16 + Neon PostgreSQL + Vercel
Menú online: ✅ /pedir/estafeten funcional (diseño básico)
Checkout: ❌ Pendiente Sprint 1
Panel admin: ❌ Pendiente Sprint 1
Pagos: ❌ Pendiente Sprint 4
```

---

## 🏁 Sprints

### Sprint 1 — El ciclo mínimo viable ✅ EN CURSO
**Objetivo**: Que un cliente pueda hacer un pedido y el dueño pueda verlo y gestionarlo.  
**Duración estimada**: 2 semanas  
**Fecha inicio**: 2026-05-20  
**Ver detalle**: [SPRINT-01.md](./SPRINT-01.md)

Entregables:
- [ ] Checkout completo con datos del cliente (nombre, teléfono, notas)
- [ ] API POST /api/orders/[tenant] — crear pedido en DB
- [ ] Panel /admin/[tenant] — vista en tiempo real de pedidos activos
- [ ] Cambio de estado de pedido (Nuevo → Preparando → Listo → Entregado)
- [ ] Notificación sonora en panel cuando llega pedido nuevo
- [ ] Fix precios 0.00 € en menú del cliente

---

### Sprint 2 — Retención y gestión ⏳ PENDIENTE
**Objetivo**: Que el dueño pueda gestionar su menú sin fricción y recibir resúmenes automáticos.  
**Duración estimada**: 2 semanas  
**Ver detalle**: [SPRINT-02.md](./SPRINT-02.md)

Entregables:
- [ ] Editor de menú en una sola pantalla (toggle disponibilidad, editar precio)
- [ ] Toggle "86" — marcar producto agotado en 1 tap desde dashboard
- [ ] Rediseño completo del menú del cliente (fotos, layout mobile-first)
- [ ] Resumen diario automático (email, WhatsApp via Twilio)
- [ ] Dashboard con comparativas vs semana anterior

---

### Sprint 3 — Crecimiento y retención ⏳ PENDIENTE
**Objetivo**: Herramientas para que el restaurante retenga y recupere clientes.  
**Duración estimada**: 2 semanas  
**Ver detalle**: [SPRINT-03.md](./SPRINT-03.md)

Entregables:
- [ ] CRM básico: historial de pedidos por cliente, ticket medio, frecuencia
- [ ] Segmentación automática: VIP / regular / en riesgo / nuevo
- [ ] Cupones de retención: crear y enviar cupón a segmento con 1 click
- [ ] Dashboard con alertas inteligentes ("Hoy vas 30% por debajo del martes pasado")
- [ ] Onboarding guiado de 5 pasos (nuevo tenant en < 15 min)

---

### Sprint 4 — Diferenciación definitiva ⏳ PENDIENTE
**Objetivo**: Features que ningún competidor tiene.  
**Duración estimada**: 2 semanas  
**Ver detalle**: [SPRINT-04.md](./SPRINT-04.md)

Entregables:
- [ ] KDS (Kitchen Display System) — pantalla de cocina en tiempo real
- [ ] Pago online nativo con Stripe (sin configuración manual)
- [ ] Multi-canal: misma app conectada a Glovo/JustEat via webhooks
- [ ] Resumen semanal con IA (narrativa automática de rendimiento)
- [ ] Modo tablet optimizado para cocina (KDS)

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

---

## 🛠️ Decisiones técnicas registradas

| Fecha | Decisión | Razón |
|-------|----------|-------|
| 2026-05-20 | Usar Server-Sent Events para realtime | WebSockets más costoso en Vercel; SSE suficiente para volumen inicial |
| 2026-05-20 | Neon PostgreSQL serverless | Compatible con Vercel Edge, free tier generoso, connection pooling automático |
| 2026-05-20 | No usar component library | Tailwind custom = control total del diseño diferenciador |
| 2026-05-20 | Zustand para carrito | Ligero, sin boilerplate, persiste en localStorage nativamente |
| 2026-05-20 | Pago contra entrega primero (Sprint 1) | Lanza más rápido; Stripe en Sprint 4 cuando hay volumen que justifique |

---

## 📈 Métricas de éxito por sprint

| Sprint | Métrica clave |
|--------|---------------|
| Sprint 1 | 1 pedido real completado de punta a punta |
| Sprint 2 | Dueño puede actualizar menú en < 2 minutos |
| Sprint 3 | Time-to-value de nuevo tenant < 15 minutos |
| Sprint 4 | Primer pago online procesado vía Stripe |
