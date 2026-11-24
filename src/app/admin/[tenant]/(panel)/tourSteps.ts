// Recorrido guiado («nubes»): los pasos de cada sección del panel. La primera
// vez que alguien entra en una sección, una nube va señalando cada parte y
// explicando para qué sirve. Ver PanelTour.tsx y docs/RECORRIDO.md
//
// target: dónde apunta la nube. Selector CSS, opcionalmente con «::texto» para
// quedarse con el que contenga ese texto (sin distinguir mayúsculas). Se
// pueden dar varios separados por « || »: vale el primero que se vea. Sin
// target, la nube sale en el centro. Si el elemento no está a la vista (p. ej.
// el menú lateral en el móvil), ese paso se salta.

export type TourStep = { target?: string; title: string; text: string };
export type Tour = { key: string; path: string; manual: string; steps: TourStep[] };

// Bienvenida: sale una vez, la primera vez que se entra al panel.
export const WELCOME: Tour = {
  key: "bienvenida",
  path: "",
  manual: "panel",
  steps: [
    { title: "¡Bienvenido a tu panel!", text: "Te enseño en un momento dónde está cada cosa. Puedes saltarlo cuando quieras y repetirlo desde Ayuda." },
    { target: "aside nav || button[aria-label^='Abrir menú']", title: "El menú", text: "Aquí tienes todas las secciones, ordenadas por cómo se usan: el día a día arriba, tu carta, tus clientes y tus números." },
    { target: "aside .side-toggle", title: "Más pantalla", text: "Con este botón el menú se pliega y solo quedan los iconos. Al pasar el cursor por uno ves su nombre." },
    { target: "button[aria-label='Pregúntale a NORA']", title: "NORA, tu asistente", text: "Pregúntale lo que quieras: cuánto llevas vendido, cómo se hace algo o qué pasa si algo no funciona. También puede agotar un producto por ti." },
    { target: "aside [data-tip='Ayuda'] || button[aria-label^='Abrir menú']", title: "Ayuda", text: "El manual de todo el panel, por secciones y con buscador. Desde ahí también puedes repetir estos recorridos." },
  ],
};

export const TOURS: Tour[] = [
  {
    key: "inicio",
    path: "home",
    manual: "inicio",
    steps: [
      { target: "main h1", title: "Inicio", text: "El resumen de tu negocio en directo: se actualiza solo mientras lo tienes abierto." },
      { target: "main a::Pedidos hoy", title: "Tus cifras de hoy", text: "Pedidos de hoy, los que están en marcha y tu carta. Toca cualquier tarjeta para ir a esa sección." },
      { target: "main h2::Últimos pedidos", title: "Últimos pedidos", text: "Los pedidos más recientes. Toca uno para verlo en Pedidos." },
      { target: "main h2::Haz tuya tu tienda", title: "Ideas para vender más", text: "Tareas que mejoran tu tienda: datos del negocio, fotos, pagos, menús… Las que no te interesen se pueden ocultar." },
    ],
  },
  {
    key: "caja",
    path: "caja",
    manual: "caja",
    steps: [
      { target: "main button::Caja", title: "Estado de la caja", text: "Para vender hay que abrir la caja con el efectivo del cajón. Desde aquí apuntas entradas y salidas de dinero y haces el cierre." },
      { target: "input[aria-label='Buscar producto']", title: "Buscar", text: "Escribe parte del nombre para encontrar un producto al momento." },
      { target: "nav[aria-label='Categorías']", title: "Categorías", text: "Toca una categoría para ver sus productos. Luego toca un producto para añadirlo al pedido." },
      { target: "[aria-label='Tipo de pedido']", title: "Tipo de pedido", text: "Para llevar, comer aquí o a domicilio. A domicilio te pide el teléfono y la dirección del cliente." },
      { target: "aside button::cobrar", title: "Cobrar", text: "Cuando el pedido esté listo, cobra en efectivo, con datáfono o Bizum. El pedido pasa solo a cocina." },
    ],
  },
  {
    key: "pedidos",
    path: "pedidos",
    manual: "pedidos",
    steps: [
      { target: "main h1", title: "Pedidos", text: "Todos los pedidos (tienda online, Caja y teléfono) en un tablero: Nuevos, Preparando, Listos y En reparto." },
      { target: "main button::Sonido", title: "Sonido", text: "Suena cada vez que entra un pedido nuevo. Si no suena, toca aquí para activarlo." },
      { target: "[aria-label='Tiempo extra de preparación']", title: "¿Mucho jaleo?", text: "Suma minutos de espera a los pedidos online para que el cliente sepa cuándo estará." },
      { target: "main button::Pausar pedidos", title: "Pausar", text: "Si no das abasto, pausa los pedidos online un rato. La tienda avisa a los clientes." },
    ],
  },
  {
    key: "mesas",
    path: "mesas",
    manual: "mesas",
    steps: [
      { target: "nav[aria-label='Zonas']", title: "Zonas", text: "Cambia entre las zonas de tu local: interior, terraza…" },
      { target: "[aria-label='Mostrar']", title: "Filtros", text: "Ve de un vistazo las mesas libres, las ocupadas y las que piden la cuenta." },
      { target: "main button[aria-label^='Mesa ']", title: "Una mesa", text: "Toca una mesa para abrirla, tomar nota, enviar rondas a cocina y cobrar." },
      { target: "main button::Editar mesas", title: "Tu sala", text: "Crea las mesas, colócalas en el plano y combina mesas para grupos." },
    ],
  },
  {
    key: "reservas",
    path: "reservas",
    manual: "reservas",
    steps: [
      { target: "main button::Hoy", title: "Los días", text: "Toca un día para ver sus reservas. El número es cuántas hay." },
      { target: "main button::Nueva reserva", title: "Apuntar una reserva", text: "Para las que llegan por teléfono o los clientes que vienen sin reservar." },
    ],
  },
  {
    key: "cocina",
    path: "cocina",
    manual: "cocina",
    steps: [
      { title: "Pantalla de cocina", text: "Pon esta pantalla en una tablet en la cocina: salen las comandas en orden. «Empezar» las pasa a preparación y «✓ Listo» avisa al cliente o al camarero." },
      { target: "[aria-label='Qué se ve']", title: "Cocina o barra", text: "Elige qué ve esta pantalla: todo, solo cocina o solo barra." },
    ],
  },
  {
    key: "facturas",
    path: "facturas",
    manual: "facturas",
    steps: [
      { target: "input[aria-label='Número del ticket o del pedido']", title: "Factura a nombre del cliente", text: "Busca el ticket o el pedido por su número y rellena los datos del cliente para hacerle la factura completa." },
      { target: "main h2::Facturas hechas", title: "Facturas hechas", text: "Las que ya has hecho: puedes verlas, imprimirlas o reenviarlas." },
    ],
  },
  {
    key: "carta",
    path: "carta",
    manual: "carta",
    steps: [
      { target: "main nav::Productos", title: "Tu carta", text: "Productos, opciones (pan, extras, salsas), menús a precio cerrado y las cartas para Glovo, Uber Eats o Just Eat." },
      { target: "main button::Añadir producto", title: "Añadir un producto", text: "Nombre, precio, categoría y foto. Se ve en la tienda al guardarlo." },
      { target: "main button::Marcar agotado", title: "Agotar", text: "Si se acaba algo, márcalo como agotado: deja de salir en la tienda hasta que lo repongas." },
      { target: "input[aria-label='Buscar producto']", title: "Buscar", text: "Encuentra cualquier producto de la carta escribiendo parte del nombre." },
    ],
  },
  {
    key: "archivos",
    path: "archivos",
    manual: "archivos",
    steps: [
      { target: "main button::Subir", title: "Tus fotos", text: "Sube aquí las fotos de tus platos y úsalas luego en la carta." },
      { target: "input[aria-label='Buscar']", title: "Buscar", text: "Encuentra una foto por su nombre." },
    ],
  },
  {
    key: "clientes",
    path: "clientes",
    manual: "clientes",
    steps: [
      { target: "main h1", title: "Clientes", text: "Quién te compra, cada cuánto y cuánto gasta. Desde aquí también creas campañas, cupones, promociones y la tarjeta de fidelidad." },
      { target: "main nav", title: "Pestañas", text: "Clientes, Campañas, Cupones, Promociones, Fidelización y Reseñas." },
    ],
  },
  {
    key: "colaboradores",
    path: "colaboradores",
    manual: "colaboradores",
    steps: [
      { target: "main h1", title: "Colaboradores", text: "Hoteles, relaciones públicas o bares que te traen clientes con su código, y lo que se lleva cada uno." },
      { target: "main button::Nuevo colaborador", title: "Dar de alta", text: "Nombre, dónde trabaja, su código y su porcentaje. Le mandas su enlace y empieza a sumar." },
    ],
  },
  {
    key: "informes",
    path: "informes",
    manual: "informes",
    steps: [
      { target: "main h1", title: "Informes", text: "Tus ventas por periodo: total, pedidos, ticket medio, días y horas fuertes, productos y canales." },
      { target: "nav[aria-label='Periodo']", title: "Periodo", text: "Elige hoy, la semana, el mes o las fechas que quieras." },
    ],
  },
  {
    key: "costes",
    path: "costes",
    manual: "costes",
    steps: [
      { target: "main h1", title: "Costes y margen", text: "Lo que te cuesta cada plato, cuánto te deja y el stock de tus ingredientes." },
      { target: "main nav", title: "Pestañas", text: "Rentabilidad, previsión, inventario, compras, escandallos, ingredientes, proveedores… Empieza por los ingredientes y los escandallos." },
    ],
  },
  {
    key: "configuracion",
    path: "configuracion",
    manual: "configuracion",
    steps: [
      { target: "nav[aria-label='Apartados de configuración']", title: "Configuración", text: "Todo lo de tu negocio por apartados: datos, usuarios, pagos, entrega, horario, impresoras, facturación…" },
      { target: "main button::Cerrar configuración || button::Cerrar configuración", title: "Volver", text: "Cuando termines, cierra la configuración para volver al panel." },
    ],
  },
  {
    key: "ayuda",
    path: "ayuda",
    manual: "panel",
    steps: [
      { target: "input[aria-label='Buscar en el manual']", title: "Busca lo que quieras hacer", text: "Escribe con tus palabras («agotar un producto», «la impresora no imprime») y te salen los temas del manual." },
      { target: "main button[aria-label='Pregúntale a NORA']", title: "O pregúntale a NORA", text: "Te responde con el manual y te lleva a la pantalla que necesitas." },
    ],
  },
];

// Qué recorrido toca en una dirección del panel (/admin/<tenant>/<path>…).
export function tourFor(pathname: string, tenant: string): Tour | null {
  const rest = pathname.slice(`/admin/${tenant}/`.length).split("/")[0] ?? "";
  return TOURS.find((t) => t.path === rest) ?? null;
}

const KEY = (k: string) => `norapp-tour:${k}`;
export function tourSeen(key: string): boolean {
  try {
    return localStorage.getItem("norapp-tours-off") === "1" || localStorage.getItem(KEY(key)) === "1";
  } catch {
    return true; // sin almacenamiento no se insiste
  }
}
export function markTourSeen(key: string) {
  try {
    localStorage.setItem(KEY(key), "1");
  } catch {}
}
export function resetTour(key: string) {
  try {
    localStorage.removeItem(KEY(key));
  } catch {}
}
