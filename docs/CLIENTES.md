# Clientes: ficha, historial y oferta recomendada

Clientes → Clientes → tocar un cliente (2026-11-10). Módulo de retención (`RETENTION`); solo el gerente.

## Qué se ve

- **Resumen**:
  - pedidos, gastado, ticket medio y último pedido (el dinero solo con «Ve lo recaudado»);
  - cómo paga, dónde pide (online o en el local), cuándo suele pedir (el día y la hora que más se repiten, con al menos 2 pedidos) y lo que más pide.
- **Historial de pedidos**: los últimos 100 por su ficha (`customerId`) o por su teléfono. Cada uno con fecha, productos, cómo y dónde se pidió y la forma de pago. Al tocarlo se ve el ticket completo: líneas con cambios y notas, dirección y nota del pedido.
- **Oferta recomendada** (`lib/customerOffer.ts`, con pruebas): reglas sencillas que acaban en un cupón que el sistema ya sabe aplicar.

  | Cliente | Oferta |
  |---|---|
  | Lleva más de 30 días sin pedir | 15 % durante 14 días |
  | Ha pedido una sola vez | 10 % en el segundo pedido, 21 días |
  | VIP | 5 € de regalo, 30 días |
  | Habitual | 3 € a partir de su ticket medio + 5 €, redondeado a 5 € |

  Además:
  - Con su plato favorito y su día y hora habituales sugiere el mensaje y cuándo mandarlo.
  - **«Crear el cupón»** crea un cupón de un solo uso con un código con su nombre (MARTA10).
  - Si el cliente **acepta ofertas**, sale **«Mandar por WhatsApp»** con el mensaje y el código. Si no, no se le puede escribir (RGPD): el código se le da en persona.

## Técnica

- `GET /api/admin/[tenant]/retention/customers/[id]` (guardia `retentionTenant`).
- Componente: `clientes/ClienteFicha.tsx`.
- El cupón se crea con el `POST /retention/coupons` de siempre.
