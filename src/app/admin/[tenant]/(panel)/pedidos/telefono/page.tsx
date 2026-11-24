import { redirect } from "next/navigation";

// Antes «Pedido por teléfono»; ahora «＋ Nuevo pedido» en Pedidos con «Por teléfono» elegido.
export default async function PedidoTelefonoPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  redirect(`/admin/${tenant}/pedidos?nuevo=telefono`);
}
