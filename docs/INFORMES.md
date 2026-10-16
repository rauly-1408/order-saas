# Informes de ventas

Panel → **Informes** (`/admin/[tenant]/informes`). Solo para gerentes. Incluido en el producto base (no es un módulo de pago).

## Qué muestra

| Bloque | Detalle |
|---|---|
| Cifras clave | Ventas, pedidos, ticket medio, clientes nuevos, descuentos y cancelados, cada una con la variación frente al periodo anterior de la misma duración |
| Ventas por día | Barras por día (por semana si el periodo pasa de 62 días); al pasar el dedo o el ratón se ve el día, el importe y los pedidos |
| Productos y categorías | Top 10 productos y top 8 categorías por importe, con unidades |
| Horas punta | Mapa día de la semana × hora con el nº de pedidos (un solo color, de claro a oscuro) y la franja con más pedidos |
| Domicilio y recogida | Reparto de pedidos e importe por canal, y gastos de envío cobrados |
| Cupones | Usos e importe descontado por código, y % de pedidos con cupón |

Periodos: Hoy, 7 días, 30 días, Este mes, Mes anterior y Personalizado (máximo un año).

## Reglas de cálculo

- Todo se calcula en la **zona horaria del restaurante** (`settings.timezone`, por defecto Europe/Madrid): un pedido a las 00:30 cuenta para el día nuevo.
- **Ventas** = total cobrado (IVA incluido, con envío y tras descuentos) de los pedidos no cancelados.
- Los pedidos **cancelados** no cuentan en ventas, rankings ni horas punta; solo en la cifra "Cancelados".
- **Clientes nuevos** = clientes cuyo primer pedido cae dentro del periodo.
- Si un producto se borró o se volvió a crear, su categoría se busca por el nombre guardado en el pedido.

## Exportar a Excel

"Exportar a Excel" descarga un CSV con un pedido por fila (fecha, nº, cliente, teléfono, canal, estado, productos, subtotal, descuento, envío, total y cupón). Usa separador `;`, coma decimal y BOM UTF-8 para que Excel en español lo abra directamente con acentos. Incluye también los cancelados (columna Estado).

## Técnica

- `src/app/lib/reports.ts` — agregación pura (`buildReport`, `changePct`, `toCsv`).
- `src/app/lib/reportsApi.ts` — permisos, periodo (`?from=AAAA-MM-DD&to=AAAA-MM-DD`) y carga de pedidos.
- `GET /api/admin/[tenant]/reports` y `GET /api/admin/[tenant]/reports/export`.
- Sin tablas nuevas ni migración: se calcula al vuelo desde `Order` y `OrderLine`.
