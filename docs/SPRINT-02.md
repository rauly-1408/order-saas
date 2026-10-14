# 🏃 SPRINT 02 — Vendible: permisos + cobro online

> **Objetivo**: que un restaurante pueda cobrar pedidos online con tarjeta, con el dinero entrando
> en SU cuenta (restaurante = *merchant of record*), y que cada usuario del panel vea solo lo que le toca.
> **Fecha plan**: 2026-10-14 | **Duración**: 2 semanas | **Estado**: 🔄 EN CURSO
>
> Ya adelantado en Sprint 1: login del panel, sesión por tenant y protección de `/api/admin/*`.

---

## 🎯 Definition of Done

1. Un cliente paga con tarjeta en `/pedir/estafeten` (modo test de Stripe) y el pedido llega al kanban marcado **Pagado**.
2. El dinero va a la cuenta Stripe del restaurante; la plataforma cobra su comisión (*application fee*).
3. Un pedido con pago fallido o abandonado **no** aparece en el kanban.
4. Cancelar un pedido pagado lo reembolsa.
5. El pago en el local sigue disponible si el restaurante lo activa.
6. Un `STORE_MANAGER` solo ve Pedidos; no puede tocar carta, personalización ni configuración (ni por API).
7. Verificación móvil de todas las páginas tocadas (ver `CLAUDE.md`).

---

## ✅ Prerrequisitos (los hace el dueño, no el código)

- [ ] Crear cuenta en **stripe.com** (empezar en **modo test**) y activar **Connect**.
- [ ] Añadir en Vercel (proyecto `order-saas`) las claves de **test**: `STRIPE_SECRET_KEY`,
      `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` y, tras crear el webhook, `STRIPE_WEBHOOK_SECRET`.
- [x] **Comisión de la plataforma decidida (2026-10-14): 3 % por pedido pagado online**, tarjeta aparte (la paga el restaurante a Stripe), sin cuota fija ni alta; 0 % en "pagar en el local". Ver `docs/competencia/LASTAPP.md`.
- [ ] Validar el modelo fiscal con un asesor antes del primer cobro real (ver ROADMAP).

---

## 🧭 Decisiones de diseño propuestas

| Tema | Propuesta | Por qué |
|---|---|---|
| Tipo de cuenta Connect | **Express** | Onboarding guiado por Stripe (KYC incluido), panel ligero para el restaurante, poco código |
| Tipo de cobro | **Direct charge** en la cuenta del restaurante + `application_fee_amount` | El restaurante es el *merchant of record* (decisión 2026-05-22) |
| Cuándo entra el pedido al kanban | Pago con tarjeta: solo cuando el **webhook** confirma `payment_intent.succeeded` | Evita preparar pedidos no pagados; el webhook es la fuente de verdad, no el navegador |
| Importe | Siempre el **total calculado en servidor** (ya existe) | El navegador no decide el precio |
| Pago en el local | Se mantiene como opción configurable por restaurante | Transición suave; algunos clientes no quieren pagar online |

---

## 📋 Backlog — P0 Crítico

### TASK-201 — Permisos por rol ✅
- `TENANT_ADMIN`: todo su restaurante. `STORE_MANAGER`: solo **Pedidos** (ver y cambiar estados). `SUPERADMIN`: todos.
- La barra lateral oculta lo que no corresponde y las páginas redirigen.
- `/api/admin/*` (carta, personalización, configuración) exige `TENANT_ADMIN` o `SUPERADMIN`.
- **Aceptación**: un `STORE_MANAGER` recibe 403 al llamar a `PATCH /api/admin/[tenant]` y no ve Carta en el menú.

### TASK-202 — Modelo de pago en base de datos (migración) ✅ (aplicada en Neon 2026-10-14)
- `Order`: `paymentMethod` (`IN_STORE` | `CARD`), `paymentStatus` (`UNPAID` | `PENDING` | `PAID` | `FAILED` | `REFUNDED`),
  `stripePaymentIntentId` (único), `applicationFeeCents`.
- `Tenant`: `stripeAccountId`, `stripeChargesEnabled`.
- Migración con `prisma migrate dev` + `migrate deploy` en Neon (nunca `db push`).

### TASK-203 — Conectar la cuenta Stripe del restaurante
- En **Configuración**: botón "Conectar con Stripe" → crea cuenta Express y abre el *Account Link* de onboarding.
- Al volver: muestra estado (pendiente / activa). Webhook `account.updated` actualiza `stripeChargesEnabled`.
- **Aceptación**: en modo test, completar el onboarding deja la cuenta como "Activa".

### TASK-204 — Pago con tarjeta en el checkout
- Selector "Pagar ahora con tarjeta" / "Pagar en el local" (según configuración del restaurante).
- Tarjeta: el servidor crea el pedido en `PENDING` y un PaymentIntent (direct charge, comisión incluida); el cliente paga con
  **Stripe Payment Element** (tarjeta, Apple Pay, Google Pay); redirige a confirmación.
- **Aceptación**: pago con tarjeta de test `4242…` llega al kanban; con `4000 0000 0000 0002` (rechazada) no llega y el cliente ve el error.

### TASK-205 — Webhook de Stripe
- `POST /api/stripe/webhook`: verifica la firma; `payment_intent.succeeded` → `PAID`; `payment_intent.payment_failed` → `FAILED`;
  `account.updated` → estado de la cuenta. **Idempotente** (reintentos de Stripe no duplican nada).
- El sonido / aviso del kanban salta cuando el pedido pasa a `PAID`, no antes.

### TASK-206 — Kanban y panel conscientes del pago
- Kanban: muestra pedidos `IN_STORE` y pedidos `CARD` solo si `PAID`. Etiqueta **Pagado** / **Pagar en el local**.
- Inicio: "Ingresos hoy" separa cobrado online vs pendiente de cobro en el local.

---

## 📋 Backlog — P1 Importante

### TASK-207 — Reembolso al cancelar
- Cancelar un pedido `PAID` crea un *refund* (incluye devolución de la comisión) y lo marca `REFUNDED`. Confirmación previa en el panel.

### TASK-208 — Gestión del equipo
- Pantalla "Equipo" para que el `TENANT_ADMIN` cree usuarios `STORE_MANAGER` y cambie contraseñas
  (sustituye al script `prisma/set-admin-password.ts`).

### TASK-209 — Deuda técnica
- Quitar `typescript.ignoreBuildErrors` de `next.config.ts` (el código ya compila; falta revisar los tipos generados por Next).
- Prueba automática de desbordes móviles (Playwright) en todas las páginas del panel y del cliente.

---

## 🗂️ Orden de desarrollo

```
Día 1:     TASK-201 (roles) + TASK-202 (migración de pago)
Día 2-3:   TASK-203 (onboarding Stripe Connect)          ← requiere claves de test
Día 4-6:   TASK-204 (checkout con Payment Element) + TASK-205 (webhook)
Día 7:     TASK-206 (kanban/inicio con estado de pago)
Día 8:     TASK-207 (reembolsos)
Día 9-10:  TASK-208 / TASK-209 + prueba E2E + verificación móvil
```

## 🧪 Flujo de prueba E2E al cierre

1. Conectar cuenta Express de test desde Configuración.
2. Pedido con tarjeta `4242 4242 4242 4242` → aparece en kanban como **Pagado**, con sonido.
3. Pedido con tarjeta rechazada → no aparece; el cliente ve el error.
4. Pedido "Pagar en el local" → aparece como **Pagar en el local**.
5. Cancelar el pedido pagado → reembolso visible en Stripe y estado `REFUNDED`.
6. Login como `STORE_MANAGER` → solo ve Pedidos; las APIs de carta devuelven 403.

## 📈 Métrica de éxito
Primer cobro online (modo test) procesado de punta a punta con el restaurante como *merchant of record*.
