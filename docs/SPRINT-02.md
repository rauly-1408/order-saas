# 🏃 SPRINT 02 — Retención y gestión

**Objetivo:** Que el dueño pueda gestionar su menú sin fricción y recibir resúmenes automáticos de actividad.
**Fecha inicio:** 2026-06-03 | **Duración:** 2 semanas | **Estado:** ⏳ PENDIENTE

---

## 🎯 Definition of Done

El sprint se considera completado cuando:

- El dueño puede editar precio y disponibilidad de cualquier producto en < 30 segundos
- El toggle "86" (agotado) funciona en 1 tap desde el dashboard
- El menú del cliente refleja en tiempo real los productos agotados (sin recargar)
- El dueño recibe un resumen diario automático (email o WhatsApp)
- El dashboard muestra comparativa vs semana anterior con contexto narrativo
- Flujo completo funciona en mobile sin errores

---

## 📋 Backlog — P0 Crítico

### TASK-011 — Editor de menú en una sola pantalla

**Tipo:** Feature | **Estimación:** 5h
**Archivos nuevos:**
- src/app/admin/[tenant]/menu/page.tsx
- src/app/admin/[tenant]/menu/MenuEditor.tsx (Client Component)

Pantalla que muestra todos los productos del tenant agrupados por categoría. El dueño puede editar precio y nombre inline sin modales.

**Criterios de aceptación:**
- Lista todos los productos agrupados por categoría
- Edición de precio inline (click → input → Enter para guardar)
- Edición de nombre inline
- Cambios se persisten vía PATCH /api/admin/products/[productId]
- Feedback visual de guardado (spinner → checkmark)
- Funciona en mobile (inputs bien dimensionados)

---

### TASK-012 — Toggle "86" — marcar producto agotado en 1 tap

**Tipo:** Feature | **Estimación:** 2h
**Archivos:** MenuEditor.tsx, src/app/api/admin/products/[productId]/route.ts

Toggle visible en cada card de producto para marcar/desmarcar como agotado (isAvailable: false).

**Criterios de aceptación:**
- Toggle visible en cada card de producto en el editor de menú
- También accesible desde el panel admin (sin salir de la vista de pedidos)
- Cambio persiste en DB inmediatamente
- El menú del cliente (/pedir/[tenant]) filtra productos isAvailable: false o los muestra con badge "Agotado" y deshabilitados
- Sin recarga de página en el admin

---

### TASK-013 — API PATCH /api/admin/products/[productId]

**Tipo:** Feature | **Estimación:** 1h
**Archivo nuevo:** src/app/api/admin/products/[productId]/route.ts

Endpoint para actualizar campos de un producto: precio, nombre, disponibilidad, imagen.

**Criterios de aceptación:**
- Solo actualiza los campos presentes en el body (PATCH parcial)
- Valida que el producto pertenece al tenant autenticado (por slug en URL)
- Devuelve el producto actualizado
- 400 si el body está vacío, 404 si no existe

---

## 📋 Backlog — P1 Importante

### TASK-014 — Dashboard con métricas del día

**Tipo:** Feature | **Estimación:** 4h
**Archivos nuevos:**
- src/app/admin/[tenant]/dashboard/page.tsx
- src/app/admin/[tenant]/dashboard/DashboardClient.tsx
- src/app/api/admin/stats/[tenant]/route.ts

Vista con métricas clave del día actual y comparativa con la semana anterior.

**Métricas a mostrar:**
- Pedidos hoy vs misma semana anterior (%, flecha arriba/abajo)
- Facturación hoy vs misma semana anterior
- Ticket medio del día
- Producto más pedido hoy
- Hora pico del día (franja de 2h con más pedidos)

**Criterios de aceptación:**
- Carga datos desde GET /api/admin/stats/[tenant]
- Comparativa con hace exactamente 7 días
- Narrativa automática: "Hoy vas un 30% por encima del martes pasado 🚀"
- Actualización automática cada 5 minutos
- Responsive en mobile y tablet

---

### TASK-015 — Resumen diario automático por email

**Tipo:** Feature | **Estimación:** 3h
**Archivos nuevos:**
- src/app/api/cron/daily-summary/route.ts
- src/app/lib/email.ts

Cron job (Vercel Cron) que envía un email de resumen al dueño cada día a las 23:00.

**Contenido del email:**
- Total pedidos del día
- Facturación total
- Ticket medio
- Top 3 productos
- Comparativa vs misma semana anterior

**Criterios de aceptación:**
- Se envía vía Resend (free tier 3k emails/mes)
- Configurado como Vercel Cron en vercel.json
- Email con diseño limpio, legible en mobile
- Tenant.email guardado en DB para envío
- Log de envíos en Vercel logs

---

### TASK-016 — Campo email en Tenant y settings

**Tipo:** Infraestructura | **Estimación:** 1h
**Archivo:** prisma/schema.prisma

Añadir email al modelo Tenant y campos de configuración de notificaciones.

**Criterios de aceptación:**
- Migración aplicada con npx prisma db push
- Seed actualizado con email de prueba para Estafetén
- Sin breaking changes en código existente

---

### TASK-017 — Subida de imágenes de producto

**Tipo:** Feature | **Estimación:** 3h
**Archivos:**
- src/app/api/admin/upload/route.ts
- Integración con Vercel Blob

Permite al dueño subir foto de cada producto desde el editor de menú.

**Criterios de aceptación:**
- Input file en cada card del editor de menú
- Upload a Vercel Blob vía POST /api/admin/upload
- Retorna URL pública que se guarda en product.imageUrl
- Preview inmediato tras subida
- Límite 2MB, solo JPEG/PNG/WebP

---

## 🗂️ Orden de desarrollo

Día 1: TASK-016 (schema email) + TASK-013 (API PATCH products)
Día 2-3: TASK-011 (editor de menú UI)
Día 4: TASK-012 (toggle "86" + integración con menú cliente)
Día 5-6: TASK-014 (dashboard + API stats)
Día 7: TASK-015 (cron resumen diario + email)
Día 8: TASK-017 (subida imágenes)
Día 9-10: Testing E2E + polish + deploy
Día 11-14: Buffer, bugs, validación mobile

---

## 🧪 Flujo de prueba E2E al cierre del sprint

1. Ir a /admin/estafeten/menu en mobile
2. Cambiar el precio de "Aesthetic" → verificar que se guarda
3. Marcar "Aesthetic" como agotado con el toggle "86"
4. Abrir /pedir/estafeten → verificar producto no disponible
5. Desmarcar agotado → recargar → producto disponible de nuevo
6. Ir a /admin/estafeten/dashboard → verificar métricas con comparativa
7. Forzar envío resumen: POST /api/cron/daily-summary → verificar email recibido
8. Subir imagen a un producto → verificar preview y persistencia

---

## 📝 Notas técnicas

- **Auth Sprint 2:** Sin autenticación todavía. Editor y dashboard accesibles por URL directa. Auth en Sprint 3.
- **Email:** Usar Resend. API key en variable de entorno RESEND_API_KEY.
- **Vercel Cron:** vercel.json: {"crons": [{"path": "/api/cron/daily-summary", "schedule": "0 23 * * *"}]}
- **Storage imágenes:** Usar Vercel Blob (@vercel/blob). Sin cuenta externa adicional.
- **Tiempo real menú:** Polling cada 60s en MenuClient para reflejar cambios de disponibilidad. SSE en Sprint 3.

---

## 📈 Métrica de éxito

El dueño puede actualizar su menú (precio, disponibilidad, imagen) en menos de 2 minutos desde el móvil.
