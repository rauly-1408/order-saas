# 🏃 SPRINT 01 — El ciclo mínimo viable

> **Objetivo**: Que un cliente pueda hacer un pedido y el dueño pueda verlo y gestionarlo en tiempo real.
> **Fecha inicio**: 2026-05-20 | **Duración**: 2 semanas | **Estado**: 🔄 EN CURSO

---

## 🎯 Definition of Done

El sprint se considera completado cuando:
1. Un cliente puede ir a `/pedir/estafeten`, elegir productos, completar el checkout y recibir confirmación
2. El pedido aparece automáticamente en `/admin/estafeten` con sonido de notificación
3. El dueño puede cambiar el estado: Nuevo → Preparando → Listo → Entregado
4. El flujo completo funciona en mobile sin errores
5. Los precios se muestran correctamente (no 0.00 €)

---

## 📋 Backlog — P0 Crítico

### TASK-001 — Fix precios 0.00 € en menú del cliente
**Tipo**: Bug | **Estimación**: 1h
**Archivos**: `src/app/api/menu/[tenant]/route.ts`, `MenuClient.tsx`

El campo en DB es `basePriceCents`. Verificar que la API lo devuelve y el componente lo recibe.

**Criterios de aceptación**:
- [ ] Todos los productos muestran su precio real en €
- [ ] El total del carrito se calcula correctamente
- [ ] Los modificadores suman al precio base correctamente

---

### TASK-002 — API POST /api/orders/[tenant]
**Tipo**: Feature | **Estimación**: 3h
**Archivo nuevo**: `src/app/api/orders/[tenant]/route.ts`

Endpoint que recibe el pedido del cliente y lo persiste en PostgreSQL.

**Request body**:
```json
{
  "customerName": "María García",
  "customerPhone": "+34 612 345 678",
  "channel": "TAKEAWAY",
  "notes": "Sin cebolla",
  "items": [
    {
      "productId": "cuid",
      "name": "Aesthetic",
      "unitPriceCents": 1595,
      "quantity": 1,
      "modifiers": { "bread": "mantequilla", "side": "patatas", "sidePriceCents": 0 }
    }
  ]
}
```

**Criterios de aceptación**:
- [ ] Crea Order y OrderLine[] en DB
- [ ] Devuelve número de pedido legible (autoincrement por tenant)
- [ ] Valida que el tenant y los productIds existen
- [ ] Maneja errores 400, 404, 500

---

### TASK-003 — Pantalla de checkout del cliente
**Tipo**: Feature | **Estimación**: 4h
**Archivo nuevo**: `src/app/pedir/[tenant]/checkout/page.tsx`

Pantalla con resumen del carrito + formulario de datos del cliente.

**Campos**: Nombre (requerido), Teléfono (requerido), Notas (opcional)

**Criterios de aceptación**:
- [ ] Muestra items del carrito con modificadores y precios
- [ ] Validación de campos requeridos
- [ ] Botón deshabilitado si carrito vacío o campos vacíos
- [ ] Al confirmar: llama a TASK-002 y redirige a confirmación
- [ ] Funciona en mobile (botón siempre visible)

---

### TASK-004 — Pantalla de confirmación del pedido
**Tipo**: Feature | **Estimación**: 1h
**Archivo nuevo**: `src/app/pedir/[tenant]/pedido/[orderId]/page.tsx`

Pantalla de éxito post-checkout con número de pedido y tiempo estimado.

**Criterios de aceptación**:
- [ ] Muestra número de pedido y tiempo estimado (20 min)
- [ ] Limpia el carrito Zustand al llegar
- [ ] Enlace para volver al menú

---

### TASK-005 — Panel admin /admin/[tenant]
**Tipo**: Feature | **Estimación**: 5h
**Archivos nuevos**:
- `src/app/admin/[tenant]/page.tsx`
- `src/app/admin/[tenant]/AdminPanel.tsx` (Client Component)

Vista de pedidos activos en tiempo real para el dueño del restaurante.

**UI**: Columnas por estado (NUEVO / PREPARANDO / LISTO). Cada tarjeta muestra: número, cliente, items, total, tiempo transcurrido, botones de avance de estado.

**Criterios de aceptación**:
- [ ] Muestra pedidos con estado CREATED, PREPARING, READY
- [ ] Auto-refresca cada 10 segundos (polling simple)
- [ ] Botón para avanzar estado: CREATED→PREPARING→READY→COMPLETED
- [ ] Botón CANCELAR en pedidos CREATED
- [ ] Indicador visual de pedido nuevo (< 2 min)
- [ ] Funciona en tablet

---

### TASK-006 — Notificación sonora en panel admin
**Tipo**: Feature | **Estimación**: 1h
**Archivo**: `AdminPanel.tsx`

Sonido cuando el polling detecta un pedido nuevo mientras el panel está abierto.

**Criterios de aceptación**:
- [ ] Sonido al detectar pedido nuevo
- [ ] Título de pestaña parpadea: "🔔 Nuevo pedido!"
- [ ] Botón de test de sonido en el panel

---

## 📋 Backlog — P1 Importante

### TASK-007 — API GET /api/admin/orders/[tenant]
**Tipo**: Feature | **Estimación**: 2h
**Archivo nuevo**: `src/app/api/admin/orders/[tenant]/route.ts`

Devuelve pedidos activos del tenant. Query params: `?status=CREATED,PREPARING,READY`

---

### TASK-008 — API PATCH /api/admin/orders/[orderId]/status
**Tipo**: Feature | **Estimación**: 1h
**Archivo nuevo**: `src/app/api/admin/orders/[orderId]/status/route.ts`

Cambia el estado de un pedido. Solo permite transiciones válidas.

---

### TASK-009 — Rediseño visual del menú del cliente
**Tipo**: UX/UI | **Estimación**: 4h

Rediseño con fondo blanco, tabs de categorías sticky, cards con imagen, precio visible, botón "+" directo para productos sin modificadores.

---

### TASK-010 — Verificar/crear modelos Order y OrderLine en Prisma
**Tipo**: Infraestructura | **Estimación**: 1h

Confirmar que schema.prisma tiene Order y OrderLine completos. Si faltan campos, añadir y correr `npx prisma db push`.

---

## 🗂️ Orden de desarrollo

```
Día 1-2:   TASK-010 (schema) + TASK-001 (fix precios)
Día 3-4:   TASK-002 (API POST) + TASK-007 (API GET) + TASK-008 (PATCH status)
Día 5-6:   TASK-003 (checkout UI) + TASK-004 (confirmación)
Día 7-8:   TASK-005 (panel admin UI)
Día 9:     TASK-006 (notificación sonora)
Día 10:    TASK-009 (rediseño menú) + testing E2E
Día 11-14: Buffer, bugs, polish, deploy
```

---

## 🧪 Flujo de prueba E2E al cierre del sprint

1. Abrir `/pedir/estafeten` en mobile
2. Añadir 2 productos con modificadores distintos
3. Abrir `/admin/estafeten` en otra pestaña
4. Completar checkout con nombre y teléfono
5. Verificar que el pedido aparece en admin con sonido
6. Mover estado a PREPARING → READY → COMPLETED
7. Verificar que pasa a historial

---

## 📝 Notas técnicas

- **Auth Sprint 1**: Sin autenticación. Solo el dueño conocerá la URL `/admin/su-tenant`.
- **Realtime**: Polling cada 10s con `setInterval`. SSE en sprints siguientes.
- **Números de pedido**: Autoincrement por tenant (cada restaurante empieza en #1).
