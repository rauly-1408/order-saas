# Arquitectura de Configuración por Tenant

**Fecha:** Mayo 2026  
**Sprint:** 3 (base) → Sprint 5 (dashboard completo)  
**Estado:** Temporal — JSON en DB hasta que el dashboard esté listo

---

## Visión del producto

Este sistema es un **Shopify / Last.app para restaurantes**. Cada restaurante (tenant) gestiona desde su dashboard:
- Identidad visual (colores, logo, fuentes)
- Carta (categorías, productos, precios, imágenes)
- Configuración operativa (delivery, horarios, zonas)
- Pedidos y clientes

El front público (`/pedir/[tenant]`) se genera automáticamente con la configuración del tenant.

---

## Estado actual (Temporal)

### Dónde vive la config

La configuración del tenant vive en dos campos JSON del modelo `Tenant` en Prisma:

```prisma
model Tenant {
  branding Json @default("{}")  // Tema visual
  settings  Json @default("{}")  // Config operativa
}
```

### Cómo funciona el flujo

```
DB (tenant.branding + tenant.settings)
  ↓
API: /api/menu/[tenant]
  ↓ getTenantTheme() + getTenantSettings()
  ↓ (src/app/lib/tenantConfig.ts)
  ↓ Merge con defaults del sistema
  ↓
MenuClient (props: theme, settings)
  ↓ themeToCssVars(theme)
  ↓
CSS custom properties aplicadas al DOM
```

### Estructura del campo branding (JSON)

```json
{
  "primaryColor": "#e8a020",
  "secondaryColor": "#f0b030",
  "backgroundColor": "#0d0d0d",
  "surfaceColor": "#1a1a1a",
  "borderColor": "#2a2a2a",
  "textPrimary": "#f0ece4",
  "textSecondary": "#888888",
  "bodyFont": "Arial, Helvetica, sans-serif",
  "headingFont": "Arial, Helvetica, sans-serif",
  "borderRadius": "14px",
  "cardStyle": "rounded",
  "logoUrl": null,
  "faviconUrl": null,
  "heroImageUrl": null
}
```

### Estructura del campo settings (JSON)

```json
{
  "deliveryEnabled": true,
  "takeawayEnabled": true,
  "minimumOrderCents": 0,
  "deliveryFeeCents": 0,
  "estimatedDeliveryMinutes": 45,
  "estimatedPickupMinutes": 20,
  "currency": "EUR",
  "phone": null,
  "whatsapp": null,
  "instagram": null,
  "address": null
}
```

---

## Plan de migración (Sprint 5 — Dashboard)

Cuando el dashboard esté listo, estos campos JSON se migrarán a tablas propias:

### Fase 1: Mantener JSON + añadir UI de edición
El dashboard leerá y escribirá directamente en `tenant.branding` y `tenant.settings`.
No requiere cambio de schema, solo los endpoints PATCH.

### Fase 2: Migrar a tablas relacionales (opcional)
Si se necesita consultar por tema o hacer reportes:

```prisma
model TenantTheme {
  id              String  @id @default(cuid())
  tenantId        String  @unique
  tenant          Tenant  @relation(...)
  primaryColor    String  @default("#e8a020")
  // ... todos los campos de TenantTheme
}

model StoreSettings {
  id                       String  @id @default(cuid())
  tenantId                 String  @unique
  tenant                   Tenant  @relation(...)
  deliveryEnabled          Boolean @default(true)
  // ... todos los campos de StoreSettings
}
```

La migración sería:
1. Crear las tablas nuevas
2. Script de migración: leer JSON → poblar tablas
3. Actualizar `getTenantTheme()` para leer de las tablas
4. Deprecar los campos JSON

---

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `src/app/lib/tenantConfig.ts` | Tipos, defaults y helpers |
| `src/app/api/menu/[tenant]/route.ts` | Devuelve theme+settings procesados |
| `src/app/pedir/[tenant]/page.tsx` | Pasa theme/settings como props |
| `src/app/pedir/[tenant]/MenuClient.tsx` | Aplica el theme via CSS vars |
| `prisma/schema.prisma` | Modelos Tenant, Category, Product |

---

## Cómo configurar un nuevo tenant

1. Insertar el tenant en la DB con slug único
2. Rellenar el campo `branding` con los colores y logo
3. Rellenar el campo `settings` con delivery/horarios
4. Añadir categorías y productos con sus imágenes
5. La carta pública estará disponible en `/pedir/[slug]`

### Ejemplo SQL para Estafetén

```sql
UPDATE "Tenant"
SET branding = '{
  "primaryColor": "#e8a020",
  "backgroundColor": "#0d0d0d",
  "logoUrl": "https://cdn.estafeten.com/logo.svg"
}'::json
WHERE slug = 'estafeten';
```

---

## TODO (Sprint 5)

- [ ] Dashboard: formulario de edición de branding
- [ ] Dashboard: formulario de edición de settings
- [ ] Dashboard: upload de logo e imágenes
- [ ] Dashboard: editor de carta (categorías y productos)
- [ ] Endpoint PATCH /api/admin/tenant/[id]/branding
- [ ] Endpoint PATCH /api/admin/tenant/[id]/settings
- [ ] Cache de configuración (revalidación cada 5min)
