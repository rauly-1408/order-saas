# 🍔 order-saas

> **Pedidos online directos + motor de retención para restaurantes independientes.**
> El cliente es del restaurante: sin marketplace en medio, sin cuotas fijas, y con las herramientas para que vuelva.

[![Producción](https://img.shields.io/badge/Vercel-producción-brightgreen)](https://order-saas-delta.vercel.app/pedir/estafeten)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![Prisma](https://img.shields.io/badge/Prisma-6-blue)](https://prisma.io)
[![DB](https://img.shields.io/badge/PostgreSQL-Neon-teal)](https://neon.tech)

**Estado:** alpha en pruebas con un restaurante piloto (Estafetén, Granada). Sin clientes reales todavía.

---

## 📦 Producto

| Módulo | Qué incluye | Estado |
|---|---|---|
| **Pedidos** (base) | Carta online con tema por restaurante, selector de pan/guarnición/extras, checkout con consentimiento de marketing, panel kanban en tiempo real con aviso sonoro, login y roles | ✅ En producción |
| **Cobro online** | Stripe Connect: el restaurante cobra a su nombre; comisión de plataforma 3 % | 🔄 Sprint 2 (pendiente de cuenta Stripe) |
| **Costes y margen** (add-on de pago) | Escandallos por plato y por opción, margen real por pedido, inventario con agotado automático, pedidos a proveedores por WhatsApp, historial de precios, alérgenos en carta | 🔄 Fases 1-3 listas (escandallos, inventario, compras) — ver [MODULO-COSTES](./docs/MODULO-COSTES.md) |
| **Retención** (add-on de pago) | Clientes y segmentos automáticos, cupones, campañas por WhatsApp y atribución (IA y envío automático en fase 2) | 🔄 Fase 1 — [SPRINT-03](./docs/SPRINT-03.md) |

Precio y posicionamiento frente a la competencia: [docs/competencia](./docs/competencia/).

---

## 🏗️ Stack

- **Next.js 16** (App Router, Server Components, Turbopack) · **React 19** · **TypeScript 5**
- **PostgreSQL** en [Neon](https://neon.tech) (producción) y Docker (local) · **Prisma 6**
- **Tailwind CSS 4** · **Zustand** (carrito)
- **Vercel** (despliegue automático desde `main`)

## 🗂️ Estructura

```
order-saas/
├── prisma/
│   ├── schema.prisma            # Modelo de datos multi-tenant
│   ├── migrations/              # Historial de migraciones (baseline 0_init, 2026-10-14)
│   ├── seed.ts                  # Carta de Estafetén (bloqueado contra bases remotas)
│   └── set-admin-password.ts    # Cambiar la contraseña de un usuario del panel
├── src/
│   ├── proxy.ts                 # Redirige /admin sin sesión al login
│   ├── store/cart.ts            # Carrito (Zustand)
│   └── app/
│       ├── pedir/[tenant]/      # Cliente: carta, selector de opciones, checkout, confirmación
│       ├── admin/[tenant]/
│       │   ├── login/           # Acceso al panel
│       │   └── (panel)/         # Panel con barra lateral (exige sesión):
│       │       ├── home/        #   Inicio (métricas del día)
│       │       ├── pedidos/     #   Kanban de pedidos
│       │       ├── carta/       #   Editor de productos
│       │       ├── costes/      #   Módulo Costes y margen (add-on)
│       │       ├── personalizacion/
│       │       └── configuracion/
│       ├── api/
│       │   ├── menu/[tenant]/           # Carta pública
│       │   ├── orders/[tenant]/         # Crear pedido (precio calculado en servidor) / listar
│       │   ├── orders/status/[orderId]/ # Cambiar estado
│       │   ├── auth/                    # Login / logout
│       │   └── admin/[tenant]/          # APIs del panel (dueño o superadmin)
│       └── lib/                 # auth, roles, menu, menuOptions, costs, payments, time…
└── docs/                        # Roadmap, sprints, módulos y competencia (ver abajo)
```

## 🔐 Roles

| Rol | Acceso |
|---|---|
| `SUPERADMIN` | Todos los restaurantes |
| `TENANT_ADMIN` | Todo su restaurante |
| `STORE_MANAGER` | Solo **Pedidos** de su restaurante |

---

## 🚀 Desarrollo local

**Requisitos:** Node.js 20+ y Docker Desktop.

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Crear `.env` (nunca se sube a git):
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/order_saas"
   SESSION_SECRET="cualquier-cadena-larga-de-al-menos-16-caracteres"
   # Opcional: redacción de campañas con IA (Claude). Sin ella, el botón aparece desactivado.
   ANTHROPIC_API_KEY="sk-ant-..."
   ```
3. Levantar PostgreSQL local:
   ```bash
   docker compose up -d
   ```
4. Aplicar migraciones:
   ```bash
   npx prisma migrate deploy
   ```
5. Cargar la carta de prueba (crea `admin@estafeten.com` y `encargado@estafeten.com` con la contraseña de prueba de `prisma/seed.ts`):
   ```bash
   npx prisma db seed
   ```
6. Arrancar:
   ```bash
   npm run dev
   ```
   Carta: http://localhost:3000/pedir/estafeten · Panel: http://localhost:3000/admin/estafeten

---

## 🧭 Cómo trabajamos

- **Ramas:** `feat/`, `fix/`, `chore/`, `docs/` desde `main`. Nada se sube directo a `main`: siempre Pull Request.
- **Commits:** conventional commits (`feat:`, `fix:`, `docs:`…) en español, explicando el porqué.
- **Antes de abrir PR:** `npm run lint` sin errores y verificación visual en **móvil (375 px) y escritorio** de todas las páginas tocadas (ver `CLAUDE.md`).
- **Base de datos:**
  - Cambios de schema → nueva migración en `prisma/migrations/` (`prisma migrate dev` en local).
  - Producción → `prisma migrate deploy` **antes** de fusionar el PR que la necesita (Vercel no ejecuta migraciones).
  - ⛔ Nunca `prisma db push` contra Neon.
  - ⛔ El seed reemplaza la carta: solo contra Neon con `SEED_ALLOW_REMOTE=1` y sabiendo que borra los escandallos.
- **Secretos:** solo en `.env` local y en Vercel (`DATABASE_URL`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`; Stripe cuando llegue).

---

## 📚 Documentación

| Documento | Contenido |
|---|---|
| [ROADMAP](./docs/ROADMAP.md) | Visión, estado, sprints y registro de decisiones |
| [SPRINT-01](./docs/SPRINT-01.md) | Ciclo mínimo de pedido (cerrado) |
| [SPRINT-02](./docs/SPRINT-02.md) | Roles + cobro online con Stripe Connect |
| [SPRINT-04](./docs/SPRINT-04.md) | Gestión sin fricción (parcialmente adelantado) |
| [MODULO-COSTES](./docs/MODULO-COSTES.md) | Add-on Costes y margen: paridad con Tavola + mejoras |
| [competencia/LASTAPP](./docs/competencia/LASTAPP.md) | Pricing de Last.app vs el nuestro |
| [competencia/CHEERFY](./docs/competencia/CHEERFY.md) | Cheerfy: el competidor más cercano en retención |
| [architecture/tenant-config](./docs/architecture/tenant-config.md) | Configuración visual y operativa por restaurante |

---

## 📄 Licencia

MIT © 2026 Rauly Valenzuela
