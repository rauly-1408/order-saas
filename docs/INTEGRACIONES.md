# Integraciones

Configuración → **Integraciones** (2026-10-29). Todo lo que un restaurante conecta con NorApp, en un sitio, como hacen Shopify o Last.app: una tarjeta por servicio con su estado y un botón. Cada restaurante contrata por su cuenta lo que quiera (Glovo, su banco, su pasarela); NorApp solo pone la conexión.

## Qué se ve

| Grupo | Tarjeta | Estado | Botón |
|---|---|---|---|
| Pedidos de las plataformas de reparto | Glovo, Uber Eats, Just Eat | «Próximamente» o «Solicitado el …» | **Solicitar** |
| Cobros | Pasarela de pago online | Stripe / Redsys (· Bizum) / Modo prueba / Sin conectar | Conectar o Gestionar → Pagos |
| Cobros | Datáfono | Listo: se cobra con el datáfono del banco y se marca «Datáfono» | Ir a la Caja |
| Reparto | Repartidor externo (Glovo On-Demand) | Glovo conectado / Modo prueba / Sin conectar | → Envío y entrega (#repartidor) |
| Reparto | Botones a las plataformas en la carta | Las plataformas con enlace o «Sin enlaces» | → Envío y entrega (#plataformas) |
| En el local | Impresoras | Cuántas y si el programa de impresión está en marcha (visto en los últimos 5 min) | → Impresoras |
| En el local | VeriFactu · Hacienda | Activado / Sin activar | → Facturación |

Lo que ya existía sigue en su apartado; esta sección lo reúne y enlaza.

## Solicitudes

«Solicitar» guarda la fecha en `Tenant.settings.integrationRequests` (`{ glovo, ubereats, justeat }`): sirve para saber cuántos restaurantes piden cada integración antes de construirla. Solo el gerente.

## Lo que viene: pedidos de las plataformas

Que los pedidos de Glovo, Uber Eats y Just Eat entren solos en Pedidos y salgan por la impresora:
1. **Primero a través de HubRise**, un conector ya aprobado por las plataformas (API abierta; según su web, 35 €/mes por local). NorApp tendría una única cuenta de socio y crearía el local de cada restaurante; el restaurante no se da de alta en HubRise. Cada plataforma tiene que activar la conexión para ese restaurante.
2. **Después, conexión directa** como socio de cada plataforma (Glovo Partners API, Uber Eats Marketplace API, Just Eat JET Connect), que exige aprobación de cada una.

Precio previsto del módulo: 39 €/mes en Esencial y Pro, incluido en Avanzado (ver la página de precios).

## Técnica

- `configuracion/integraciones/Integraciones.tsx` y `page.tsx`; apartado `integraciones` en `configuracion/sections.ts` (icono `plug`).
- `GET /api/admin/[tenant]/integraciones`: estado calculado de `PaymentAccount`, `CourierAccount`, `settings.deliveryPartners`, `settings.printing` y `settings.verifactu`. `POST { request: "glovo" | "ubereats" | "justeat" }`. Solo gerente (`denyUnlessTenantAdmin`).
- Anclas `#repartidor` (RepartoExterno) y `#plataformas` (ConfiguracionClient) para llegar directo desde las tarjetas.
