// Apartados de Configuración, en el orden de Shopify. Sin React: lo usan el
// menú (cliente) y las páginas (servidor).
export type IconName =
  | "store" | "plan" | "users" | "card" | "cart" | "truck" | "tax" | "pin" | "clock" | "gift" | "globe" | "brush" | "bell" | "lang" | "doc" | "printer" | "receipt" | "plug";

export const CONFIG_SECTIONS: { slug: string; label: string; icon: IconName; description: string }[] = [
  { slug: "negocio", label: "Información del negocio", icon: "store", description: "Razón social, NIF, dirección y contacto. Salen en el pie de tu tienda y en los textos legales." },
  { slug: "plan", label: "Plan y facturación", icon: "plan", description: "Tu plan, los módulos contratados y la comisión de la plataforma." },
  { slug: "usuarios", label: "Usuarios y permisos", icon: "users", description: "Quién entra en el panel y qué puede hacer." },
  { slug: "pagos", label: "Pagos", icon: "card", description: "La pasarela con la que cobras online y el pago en persona." },
  { slug: "pantalla-de-pago", label: "Pantalla de pago", icon: "cart", description: "Qué ve y qué puede hacer el cliente al confirmar el pedido." },
  { slug: "entrega", label: "Envío y entrega", icon: "truck", description: "Recogida y reparto, precios, tiempos, plataformas y repartidor externo." },
  { slug: "integraciones", label: "Integraciones", icon: "plug", description: "Conecta NorApp con Glovo, Uber Eats y Just Eat, tu pasarela de cobro, el repartidor externo y tus impresoras." },
  { slug: "impuestos", label: "Impuestos", icon: "tax", description: "El IVA de tus precios y cómo se muestra al cliente." },
  { slug: "facturacion", label: "Facturación · VeriFactu", icon: "receipt", description: "Facturas simplificadas con numeración legal, huella encadenada y QR de Hacienda (obligatorio desde 2027)." },
  { slug: "sucursales", label: "Sucursales", icon: "pin", description: "Tus locales: cada uno con su horario y sus zonas de reparto." },
  { slug: "horario", label: "Horario y zonas", icon: "clock", description: "Horario semanal, cierres puntuales y zonas de reparto de cada local." },
  { slug: "tarjetas-regalo", label: "Tarjetas regalo", icon: "gift", description: "Crea tarjetas con saldo que tus clientes canjean al pedir." },
  { slug: "dominios", label: "Dominios", icon: "globe", description: "La dirección web de tu tienda y tu dominio propio." },
  { slug: "marca", label: "Marca", icon: "brush", description: "Logotipos, colores, fuentes y cómo apareces en Google y en redes." },
  { slug: "notificaciones", label: "Notificaciones", icon: "bell", description: "Cómo te avisamos de los pedidos y cómo avisamos a tus clientes." },
  { slug: "impresoras", label: "Impresoras", icon: "printer", description: "Comandas a cocina y tickets al cliente en tus impresoras de tickets." },
  { slug: "idiomas", label: "Idiomas", icon: "lang", description: "Tu carta en inglés para los turistas." },
  { slug: "politicas", label: "Políticas", icon: "doc", description: "Aviso legal, privacidad, cookies y condiciones de venta." },
];

export const sectionBySlug = (slug: string) => CONFIG_SECTIONS.find((s) => s.slug === slug);
