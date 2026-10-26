# Colaboradores (RRPP, hoteles, B&B, pubs)

Gente que trae pedidos y se lleva un % de lo que piden, en efectivo, cada mes. Idea: la RRPP de una discoteca, la encargada de un pub o el dueño de un B&B reparten el código o el QR entre sus clientes; cuando piden, ganan dinero sin hacer nada más.

## Cómo funciona

1. **Panel → Colaboradores → Nuevo colaborador**: nombre, dónde trabaja, teléfono, su **código** (se propone solo con el nombre: LAURA) y **qué % se lleva** (10 % por defecto, de 1 a 50).
2. **Mandarle su enlace por WhatsApp**: le llega
   - el enlace de la tienda con su código ya puesto (`/pedir/[slug]?c=LAURA`), para pasarlo a sus clientes;
   - su **página privada** (`/colaborador/[enlace secreto]`): lo que lleva ganado este mes, los meses anteriores (pagado o pendiente), sus pedidos (sin datos de clientes) y su **QR** para imprimir o enseñar con el móvil, con botón de compartir por WhatsApp.
3. El cliente pide **desde su enlace o su QR** (el código se recuerda 30 días en el móvil del cliente), o **escribe el código** al pagar («¿Tienes un código?», o en el campo del cupón si el restaurante tiene cupones). En el pedido sale «Código de colaborador LAURA» y se puede quitar.
4. **Por teléfono**: en la **Caja**, en «Cliente, cupón, colaborador o nota», se elige «De Laura (Pub…)».
5. Cada pedido guarda lo que se lleva: su % de lo pedido **sin envío ni propina** y con los descuentos restados. Los pedidos **cancelados no cuentan**.
6. **A principios de mes**: en Colaboradores se va al mes anterior (‹) y se pulsa **«Marcar pagado X €»** al darle el sobre. Se puede deshacer. Si se olvida, en el mes en curso sale «Le debes X € de meses anteriores».

Otras acciones: **Pausar** (su código deja de contar), **Editar**, **Borrar** (si ya tiene pedidos se pone en pausa para no perder el historial) y **Cambiar enlace privado** (si se ha compartido de más).

El cliente **no tiene descuento** por usar el código: el % sale del margen del restaurante. Precio de referencia: el de las plataformas de reparto, cuya comisión (~30 %) deja sitio para pagar al colaborador.

## App del colaborador (2026-10-26)

Su página privada es una **app que se instala** en el móvil («Mis ventas», con el icono del restaurante):
- Android/Chrome: botón «Instalar «Mis ventas»». iPhone: Safari → Compartir → «Añadir a pantalla de inicio». Instalada, abre directamente su perfil y nada más (`scope` = su enlace).
- **Al momento**: se refresca sola cada 15 s con la pantalla abierta y al volver a ella; con un pedido nuevo con su código sale «¡Nuevo pedido con tu código! +2,09 €», vibra y la línea se resalta.
- Arriba: lo ganado este mes, cuántos pedidos y por cuánto ha traído, su %, y una barra **frente al mes pasado** («¡Ya has superado lo del mes pasado!»).
- Con la app cerrada no llegan avisos (haría falta notificación push).

## Avisos y tarjetas VIP (2026-10-27)
- **Avisos de cada venta** con la app cerrada: en su app, «Avisarme de cada venta» (ver `docs/AVISOS-MOVIL.md`).
- **Tarjetas VIP para imprimir** (`/colaborador/[token]/tarjetas`): tamaño tarjeta de visita (85 × 55 mm), 10 por folio A4, con el logo del restaurante, «Pide online con mi código», el código y el QR de la tienda con su código. Se abre desde su app («Imprimir tarjetas») o desde el panel (Colaboradores → «Tarjetas VIP para imprimir»).

## Técnica

- Modelos `Collaborator` (código único por restaurante, `commissionPct`, `token` de la página privada) y `CollaboratorPayout` (un pago por colaborador y mes, AAAA-MM). `Order.collaboratorId` y `Order.commissionCents` (se calcula al crear el pedido). Migración `20261025220000_collaborators`.
- `lib/collaborators.ts`: código (`normalizeCollabCode`), comisión (`commissionCents`), meses en la hora del restaurante (`monthOf`, `monthStart`), `collaboratorByCode`, `parseCollaborator`.
- Tienda: `pedir/[tenant]/collab.ts` guarda `?c=` en `localStorage` (`collab:[slug]`, 30 días); `CheckoutClient` lo enseña y lo manda como `collaboratorCode`. Un código que no existe no impide el pedido.
- APIs: `GET /api/collaborators/[tenant]?code=` (pública, con límite de peticiones), `GET/POST /api/admin/[tenant]/colaboradores` (`?month=`, `?lite=1` para la Caja), `PATCH/DELETE …/[id]`, `POST/DELETE …/[id]/pago`. Caja y tienda aceptan `collaboratorCode`.
- La app `/colaborador/[token]` (`ColaboradorLive.tsx`) pide `GET /api/colaborador/[token]` (con límite de peticiones; datos en `lib/collaboratorDashboard.ts`) y su manifiesto es `/colaborador/[token]/manifest.webmanifest`. No se indexa y se abre también desde el dominio propio del restaurante (`proxy.ts`).
- Pruebas: `src/app/lib/__tests__/colaboradores.test.ts`.
