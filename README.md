# 🍔 order-saas

> **SaaS de pedidos online para restaurantes** — La alternativa a Last.app con lo que Last.app no tiene.

[![Deploy](https://img.shields.io/badge/Vercel-deployed-brightgreen)](https://order-saas-delta.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![Prisma](https://img.shields.io/badge/Prisma-6-blue)](https://prisma.io)
[![DB](https://img.shields.io/badge/PostgreSQL-Neon-teal)](https://neon.tech)

---

## 🎯 Visión del producto

order-saas es una plataforma multi-tenant que permite a cualquier restaurante tener:

- **Menú online propio** accesible por QR o link
- **Panel de gestión de pedidos en tiempo real** (lo que Last.app no tiene)
- **CRM ligero** de clientes con historial y segmentación
- **Dashboard inteligente** con comparativas y alertas
- **Onboarding en 15 minutos** (vs horas en competidores)

### ¿Por qué supera a Last.app?

| Funcionalidad | Last.app | order-saas |
|---|---|---|
| Monitor de pedidos en tiempo real (KDS) | ❌ | ✅ |
| Toggle "producto agotado" desde dashboard | ❌ (6 pasos) | ✅ (1 tap) |
| Resumen semanal automático por WhatsApp | ❌ | ✅ |
| Onboarding guiado en 15 min | ❌ | ✅ |
| Editor de menú en una pantalla | ❌ (6 pantallas) | ✅ |
| Pago online nativo | config manual | ✅ nativo |
| Alertas de rendimiento inteligentes | ❌ | ✅ |
| CRM con segmentación por comportamiento | ❌ | ✅ |

---

## 🏗️ Arquitectura

```
order-saas/
├── prisma/
│   ├── schema.prisma        # Multi-tenant: Tenant → Store → Product → Order
│   └── seed.ts              # Datos de prueba (Estafetén)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── menu/[tenant]/     # GET menú público
│   │   │   └── orders/[tenant]/   # POST crear pedido (Sprint 1)
│   │   ├── pedir/[tenant]/        # UI cliente (menú + carrito + checkout)
│   │   └── admin/[tenant]/        # Panel dueño (Sprint 1)
│   ├── store/
│   │   └── cart.ts                # Zustand cart store
│   └── lib/
│       └── prisma.ts              # Prisma client singleton
└── docs/
    ├── ROADMAP.md                 # Visión completa del producto
    ├── SPRINT-01.md               # Checkout + Panel pedidos + Notificaciones
    ├── SPRINT-02.md               # Editor menú + WhatsApp digest
    ├── SPRINT-03.md               # CRM + Dashboard inteligente
    └── SPRINT-04.md               # KDS + Stripe + Onboarding
```

### Stack técnico

- **Framework**: Next.js 16 (App Router, Server Components, Turbopack)
- **Base de datos**: PostgreSQL via [Neon](https://neon.tech) (serverless)
- **ORM**: Prisma 6
- **UI**: Tailwind CSS (sin component library — 100% custom)
- **State**: Zustand (carrito del cliente)
- **Realtime**: Server-Sent Events (pedidos en tiempo real)
- **Deploy**: Vercel (producción en order-saas-delta.vercel.app)

### Modelo de datos (simplificado)

```
Tenant (restaurante)
  └── Store (local físico)
  └── Category[]
       └── Product[]
            └── ModifierGroup[]
  └── Order[]
       └── OrderLine[]
```

---

## 🚀 Instalación local

### Prerequisitos

- Node.js 20+
- Docker Desktop (para PostgreSQL local)

### Setup

```bash
git clone https://github.com/rauly-1408/order-saas.git
cd order-saas
npm install
```

### Variables de entorno

Crea un archivo `.env`:

```env
# Base de datos (local con Docker o Neon en la nube)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/order_saas?schema=public"

# Para producción (Neon)
# DATABASE_URL="postgresql://neondb_owner:...@ep-...neon.tech/neondb?sslmode=require"
```

### Base de datos

```bash
# Opción A: Docker local
docker compose up -d
npx prisma db push
npx ts-node prisma/seed.ts

# Opción B: Neon (ya configurado en producción)
npx prisma db push
npx ts-node prisma/seed.ts
```

### Desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000/pedir/estafeten](http://localhost:3000/pedir/estafeten)

---

## 🌐 URLs de producción

| URL | Descripción |
|-----|-------------|
| `/pedir/[tenant]` | Menú público del restaurante |
| `/admin/[tenant]` | Panel del dueño (Sprint 1 — en desarrollo) |
| `/api/menu/[tenant]` | API pública del menú |
| `/api/orders/[tenant]` | API de pedidos (Sprint 1 — en desarrollo) |

**Tenant de prueba**: `estafeten`  
**URL live**: [order-saas-delta.vercel.app/pedir/estafeten](https://order-saas-delta.vercel.app/pedir/estafeten)

---

## 📋 Roadmap

Ver [docs/ROADMAP.md](./docs/ROADMAP.md) para la visión completa.

| Sprint | Objetivo | Estado |
|--------|----------|--------|
| Sprint 1 | Checkout + Panel pedidos + Notificaciones | 🔄 En curso |
| Sprint 2 | Editor menú + Resumen diario WhatsApp | ⏳ Pendiente |
| Sprint 3 | CRM + Dashboard inteligente + Onboarding | ⏳ Pendiente |
| Sprint 4 | KDS + Stripe nativo + Reportes IA | ⏳ Pendiente |

---

## 🤝 Contribuir

1. Crea una branch: `git checkout -b feature/nombre-feature`
2. Commitea con conventional commits: `feat:`, `fix:`, `docs:`
3. Push y abre un Pull Request hacia `main`

---

## 📄 Licencia

MIT © 2026 Rauly Valenzuela
