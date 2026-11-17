// Borra los pedidos de prueba de un restaurante para abrir con todo a cero:
// pedidos, facturas (si ninguna se ha enviado a Hacienda), clientes, caja,
// reseñas, impresiones y pagos a colaboradores; devuelve al inventario el stock
// que gastaron y el saldo de las tarjetas regalo; pone a cero los usos de cupones.
// La carta, los ajustes, los usuarios y los colaboradores NO se tocan.
//
//   node --env-file=.env scripts/empezar-de-cero.mjs <restaurante>            → solo enseña el resumen
//   node --env-file=.env scripts/empezar-de-cero.mjs <restaurante> --borrar   → pide confirmación y borra
//   … --conservar-clientes   → deja los clientes (con sus totales a cero) y borra el resto
//   … --todo                 → además borra reservas, compras a proveedor, albaranes,
//                              campañas y tarjetas regalo de prueba (la carta y los
//                              ingredientes siguen sin tocarse)
//
// Ver docs/OPERACIONES.md
import { createInterface } from "node:readline";
import { PrismaClient } from "@prisma/client";

const [slug, ...flags] = process.argv.slice(2);
const flag = flags.includes("--borrar") ? "--borrar" : undefined;
const keepCustomers = flags.includes("--conservar-clientes");
const everything = flags.includes("--todo");
const ask = (q) => new Promise((ok) => { const rl = createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); ok(a.trim()); }); });
const prisma = new PrismaClient();

try {
  if (!slug) throw new Error("Falta el restaurante: node --env-file=.env scripts/empezar-de-cero.mjs estafeten");
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!tenant) throw new Error(`No existe el restaurante «${slug}»`);
  const t = { tenantId: tenant.id };
  const orderIds = (await prisma.order.findMany({ where: t, select: { id: true } })).map((o) => o.id);
  const byOrder = { orderId: { in: orderIds } };
  const invoices = await prisma.invoice.groupBy({ by: ["aeatStatus"], where: t, _count: true });
  const sent = invoices.filter((i) => i.aeatStatus !== "PENDIENTE_ENVIO").reduce((s, i) => s + i._count, 0);
  const counts = {
    pedidos: orderIds.length,
    "facturas de prueba (nunca enviadas a Hacienda)": invoices.reduce((s, i) => s + i._count, 0),
    "movimientos de stock de pedidos": await prisma.stockMovement.count({ where: { ...t, orderId: { not: null } } }),
    [keepCustomers ? "clientes (se conservan; sus totales de pedidos vuelven a cero)" : "clientes"]: await prisma.customer.count({ where: t }),
    "sesiones de caja": await prisma.cashSession.count({ where: t }),
    "trabajos de impresión": await prisma.printJob.count({ where: t }),
    "pagos a colaboradores": await prisma.collaboratorPayout.count({ where: t }),
    "cupones usados": await prisma.coupon.count({ where: { ...t, redeemedCount: { gt: 0 } } }),
    ...(everything && {
      reservas: await prisma.reservation.count({ where: t }),
      "compras a proveedor": await prisma.purchaseOrder.count({ where: t }),
      "albaranes leídos": await prisma.supplierInvoice.count({ where: t }),
      campañas: await prisma.campaign.count({ where: t }),
      "tarjetas regalo": await prisma.giftCard.count({ where: t }),
    }),
  };
  console.log(`\n${tenant.name}: esto es lo que se borraría\n`);
  for (const [k, v] of Object.entries(counts)) console.log(`  · ${k}: ${v}`);
  console.log(`\n  La carta, ${everything ? "los ingredientes (con su stock actual), " : ""}los ajustes, los usuarios y los colaboradores NO se tocan.`);
  if (sent) throw new Error(`Hay ${sent} facturas ya enviadas a Hacienda (VeriFactu): no se pueden borrar. No se ha cambiado nada.`);
  if (flag !== "--borrar") {
    console.log("\nNo se ha borrado nada. Para borrar, añade --borrar al final.\n");
  } else {
    // Una sola palabra: algunas terminales cortan lo escrito en el primer espacio.
    const typed = await ask(`\nEsto NO se puede deshacer. Para confirmar, escribe el nombre del restaurante (${slug}): `);
    if (typed.toLowerCase() !== slug.toLowerCase()) throw new Error(`No coincide (has escrito «${typed}»). No se ha cambiado nada.`);
    await prisma.$transaction(async (tx) => {
      // 1) El stock que gastaron los pedidos vuelve al inventario.
      const moves = await tx.stockMovement.findMany({ where: { ...t, orderId: { not: null } }, select: { ingredientId: true, quantity: true } });
      const back = new Map();
      for (const m of moves) back.set(m.ingredientId, (back.get(m.ingredientId) ?? 0) - m.quantity);
      for (const [id, qty] of back) await tx.ingredient.update({ where: { id }, data: { stockQty: { increment: qty } } });
      await tx.stockMovement.deleteMany({ where: { ...t, orderId: { not: null } } });
      // 2) El saldo gastado de las tarjetas regalo vuelve a la tarjeta.
      const gifts = await tx.order.groupBy({ by: ["giftCardId"], where: { ...t, giftCardId: { not: null } }, _sum: { giftCardCents: true } });
      for (const g of gifts) if (g.giftCardId && g._sum.giftCardCents) await tx.giftCard.update({ where: { id: g.giftCardId }, data: { balanceCents: { increment: g._sum.giftCardCents } } });
      // 3) Pedidos y todo lo que cuelga de ellos.
      await tx.printJob.deleteMany({ where: t });
      // Las facturas de prueba (ninguna enviada a Hacienda: se ha comprobado arriba) se
      // borran para que la numeración legal empiece en 1 al abrir. La protección de
      // VeriFactu se quita solo para este borrado y dentro de esta misma transacción:
      // si algo falla, todo vuelve atrás y la protección sigue puesta.
      await tx.$executeRawUnsafe('ALTER TABLE "Invoice" DISABLE TRIGGER invoice_inalterable');
      await tx.invoice.deleteMany({ where: t });
      await tx.$executeRawUnsafe('ALTER TABLE "Invoice" ENABLE TRIGGER invoice_inalterable');
      await tx.orderLine.deleteMany({ where: byOrder });
      await tx.order.deleteMany({ where: t });
      // 4) Clientes de prueba (y sus envíos de campañas), caja y pagos a colaboradores.
      if (keepCustomers) {
        await tx.customer.updateMany({ where: t, data: { ordersCount: 0, totalSpentCents: 0, firstOrderAt: null, lastOrderAt: null, segment: "NEW" } });
      } else {
        await tx.campaignSend.deleteMany({ where: { customer: t } });
        await tx.customer.deleteMany({ where: t });
      }
      await tx.cashSession.deleteMany({ where: t });
      await tx.collaboratorPayout.deleteMany({ where: t });
      await tx.coupon.updateMany({ where: t, data: { redeemedCount: 0 } });
      // 5) Con --todo: el resto de datos de prueba que no cuelgan de los pedidos.
      if (everything) {
        await tx.reservation.deleteMany({ where: t });
        await tx.purchaseOrder.deleteMany({ where: t }); // sus líneas se borran en cascada
        await tx.supplierInvoice.deleteMany({ where: t });
        await tx.campaignSend.deleteMany({ where: { campaign: t } });
        await tx.campaign.deleteMany({ where: t });
        await tx.giftCard.deleteMany({ where: t });
      }
    }, { timeout: 120_000 });
    console.log("\n✓ Hecho. El restaurante empieza de cero.\n");
  }
} catch (e) {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
