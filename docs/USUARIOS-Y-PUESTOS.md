# Usuarios y puestos

Cada persona entra con su **puesto** y el panel le enseña solo lo que le toca. Así el restaurante reparte las tareas: la caja cobra, los camareros llevan las mesas, y cocina y barra ven sus comandas.

Se configura en **Configuración → Usuarios**. El cambio vale al momento, porque la sesión se lee de la base de datos en cada petición (`fresh()` en `lib/auth.ts`).

## Qué ve cada puesto

| | Gerente | Encargado de sala | Caja | Camarero | Cocina | Barra |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Caja | ✓ | ✓ | ✓ | — | — | — |
| Pedidos | ✓ | ✓ | ✓ | ✓ | solo sus líneas | solo sus líneas |
| Mesas | ✓ | ✓ | ✓ | ✓ | — | — |
| Cobrar | ✓ | ✓ | ✓ | si tiene «Puede cobrar» | — | — |
| Facturas | ✓ | ✓ | ✓ | — | — | — |
| Anular lo enviado, cerrar sin cobrar, cancelar | ✓ | ✓ | cancelar pedidos | — | — | — |
| Carta, costes, clientes, configuración | ✓ | — | — | — | — | — |
| Pantalla al entrar | Inicio | Caja | Caja | Mesas | Pedidos | Pedidos |

- **Ve lo recaudado** es aparte: se marca a cada persona, sea cual sea su puesto.
- **Cocina y barra**:
  - solo ven las líneas de las **secciones de la carta** que tengan marcadas;
  - por defecto, barra recibe las secciones de bebidas (refrescos, vinos, cervezas, cafés…) y cocina el resto;
  - las líneas libres van a cocina;
  - solo pueden pasar un pedido a aceptado, preparando o listo. No cobran, no cancelan y no ven el ticket.
- **Camarero sin «Puede cobrar»**: donde estaría «Cobrar» ve «Cobra la caja».

## Cómo se guarda

- `User.role`:
  - `TENANT_ADMIN` es el gerente;
  - `STORE_MANAGER` es un empleado, y su puesto va en `User.position` (`ENCARGADO`, `CAJA`, `CAMARERO`, `COCINA` o `BARRA`).
  - Los empleados antiguos sin puesto cuentan como **Caja**, que es lo que podían hacer antes.
- `User.canCharge` y `User.stationCategoryIds` (las secciones de cocina o barra).
- La regla está en un único sitio, `accessOf()` en `src/app/lib/roles.ts`, y la usan:
  - el menú;
  - las páginas (`requireAreaPage`);
  - las APIs (`denyUnlessArea`, `lib/tableActions.ts`, `api/orders/status`);
  - el filtro de líneas de `GET /api/orders/[tenant]`.
- Una petición sin permiso responde **403** con el texto «Tu puesto no tiene acceso a esto. Pídeselo al gerente.».
