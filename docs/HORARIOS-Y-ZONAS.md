# Horarios, cierres, pausa y zonas de reparto

Operativa de la tienda online, para que no entren pedidos cuando el restaurante no puede atenderlos. Todo vive en el **local** (`Store`), que es la referencia para los pedidos.

## Qué hay

| Pieza | Dónde se configura | Efecto |
|---|---|---|
| **Horario semanal** (1-2 franjas por día; admite pasar de medianoche, p. ej. 20:00–02:00) | Configuración → Horario de apertura | Fuera de horario la carta se ve, pero no se puede pedir. Sin horario = siempre abierto |
| **Cierres programados** (vacaciones, festivos) | Configuración → Cierres programados | Entre las dos fechas no se aceptan pedidos |
| **Pausar pedidos** 15 min / 30 min / 1 h / hasta reabrir | Pedidos → cabecera (también el encargado) | Pausa inmediata; "Reanudar pedidos" la quita |
| **Tiempo extra** +10 / +20 / +30 min | Pedidos → cabecera | Se suma al tiempo estimado que ve el cliente |
| **Zonas de reparto** por código postal, con envío y pedido mínimo propios | Configuración → Horario y zonas de reparto | Con zonas activas, a domicilio se pide el código postal y solo se reparte a esas zonas. Sin zonas, se usa el envío general |

El pedido mínimo (general o de la zona) se aplica **solo a domicilio**.

## Cómo se aplica
- `lib/storeStatus.ts` (funciones puras): estado (abierto / horario / cierre / pausa), próxima apertura ("hoy a las 20:00"), zona por código postal. Hora del restaurante (`settings.timezone`, por defecto Europe/Madrid).
- `lib/storeOps.ts`: lee el local con sus cierres vigentes y zonas, y calcula el estado.
- **El servidor manda** (`POST /api/orders/[tenant]`): rechaza con 409 si está cerrado o en pausa (con el motivo y la reapertura), exige código postal y zona si hay zonas, y aplica envío y mínimo de la zona. La carta y el checkout solo lo anticipan.
- API del panel: `GET/PATCH /api/admin/[tenant]/store` (pausa y tiempo extra también para el encargado; horario solo el dueño), `…/store/closures`, `…/store/zones`.

## Arreglo incluido
Configuración guardaba envío, mínimo, canales y tiempos en `Tenant.settings`, pero los pedidos usaban las columnas de `Store`: el checkout enseñaba 2,00 € de envío y se cobraban 0 €. Ahora Configuración actualiza también el local, la carta lee del local y la migración `20261016120000_store_hours_zones` copia los valores existentes.
