// Preguntas frecuentes de NORA: «¿cómo se hace…?» sobre el propio panel.
// NORA las consulta con la herramienta como_se_hace. Cada entrada dice DÓNDE
// está y los pasos justos. Si algo cambia de sitio en el panel, se cambia aquí.
// Ver docs/ASISTENTE.md

export type GuideEntry = { id: string; title: string; keys: string[]; answer: string };

export const GUIDE: GuideEntry[] = [
  {
    id: "agotar",
    title: "Agotar un producto o volver a ponerlo a la venta",
    keys: ["agotar", "agotado", "sin stock", "quitar de la venta", "reponer", "disponible", "no queda"],
    answer: "Lo más rápido: pídemelo («agota la cochinita») y te saco el botón para confirmarlo. A mano: Carta → Productos → toca el producto → desmarca o marca «Disponible». Si se agota por falta de ingrediente, vuelve solo cuando repongas stock en Costes → Inventario.",
  },
  {
    id: "producto-nuevo",
    title: "Añadir o cambiar un producto de la carta",
    keys: ["añadir producto", "nuevo producto", "crear producto", "cambiar precio", "precio", "foto", "descripcion", "editar producto", "plato nuevo"],
    answer: "Carta → Productos → «Nuevo producto» (o toca uno para editarlo). Nombre, precio, categoría y foto; guarda abajo. Las fotos subidas quedan también en Archivos para reutilizarlas.",
  },
  {
    id: "opciones",
    title: "Extras, tamaños y opciones de un producto",
    keys: ["extra", "extras", "opciones", "tamaño", "salsa", "ingrediente extra", "modificador", "punto de la carne"],
    answer: "Carta → Opciones → «+ Nuevo grupo»: crea el grupo (por ejemplo «Salsas», con o sin precio) y luego asígnalo a los productos que lo lleven.",
  },
  {
    id: "combos",
    title: "Menús y combos",
    keys: ["menu del dia", "combo", "menú", "pack", "oferta de menu"],
    answer: "Carta → Combos y menús → «+ Nuevo menú»: eliges qué productos entran en cada paso y el precio cerrado.",
  },
  {
    id: "carta-delivery",
    title: "Carta para Glovo, Uber Eats y Just Eat",
    keys: ["glovo", "uber", "just eat", "plataformas", "delivery", "precio plataformas", "carta delivery"],
    answer: "Carta → Cartas delivery: una carta por plataforma con sus precios. Al editar un producto, «¿Dónde se vende?» marca en qué cartas sale. La conexión con cada plataforma está en Configuración → Integraciones.",
  },
  {
    id: "ingles",
    title: "Carta en inglés",
    keys: ["ingles", "idioma", "traducir", "turistas", "english"],
    answer: "Configuración → Idiomas: actívalo y traduce la carta (se puede traducir de golpe y retocar lo que quieras).",
  },
  {
    id: "horario",
    title: "Horario, cierres y vacaciones",
    keys: ["horario", "abrir", "cerrar", "cierre", "vacaciones", "festivo", "hora de apertura", "cerrado hoy"],
    answer: "Configuración → Horario y zonas: horario de cada día y «cierres puntuales» para festivos o vacaciones. Fuera de horario la tienda deja pedir para más tarde o no deja pedir, según lo tengas.",
  },
  {
    id: "zonas",
    title: "Zonas y precio del reparto",
    keys: ["zona", "reparto", "domicilio", "envio", "gastos de envio", "pedido minimo", "radio", "codigo postal"],
    answer: "Configuración → Horario y zonas para dibujar las zonas de cada local, y Configuración → Envío y entrega para precio del envío, pedido mínimo y tiempos.",
  },
  {
    id: "impresora",
    title: "Impresoras de tickets y comandas",
    keys: ["impresora", "imprimir", "ticket", "comanda", "no imprime", "cocina imprime", "barra"],
    answer: "Configuración → Impresoras: añade cada impresora y, si tienes varias, en «Dónde sale cada cosa» marca qué categoría va a cada una (Bebidas → Barra). Si no imprime: comprueba que esté encendida y con papel, y que el ordenador del local que la conecta esté encendido. El aspecto del ticket se cambia en Configuración → Ticket.",
  },
  {
    id: "usuarios",
    title: "Dar acceso a un empleado",
    keys: ["usuario", "empleado", "camarero", "acceso", "contraseña", "permiso", "puesto", "encargado", "cocinero"],
    answer: "Configuración → Usuarios y permisos → nuevo usuario: su correo y su puesto (camarero, cocina, encargado…). El puesto decide qué ve; «Ve lo recaudado» se marca aparte.",
  },
  {
    id: "mesas",
    title: "Mesas: abrir, pedir y cobrar",
    keys: ["mesa", "abrir mesa", "ronda", "cobrar mesa", "juntar mesas", "plano", "comensales", "dividir cuenta"],
    answer: "Mesas → toca la mesa → añade la ronda y envíala a cocina. Para cobrar: dentro de la mesa → Cobrar (efectivo, tarjeta o mixto). Para cambiar el plano o juntar mesas: Mesas → Editar mesas.",
  },
  {
    id: "caja",
    title: "Caja: abrir, cerrar y cuadrar",
    keys: ["caja", "cierre de caja", "arqueo", "cuadrar", "efectivo", "abrir caja", "fondo", "z"],
    answer: "Menú → Caja: «Abrir caja» con el fondo, apuntas entradas y salidas de efectivo y al final «Cerrar caja», contando billetes y monedas. Si algo no cuadra, el cierre te enseña la diferencia.",
  },
  {
    id: "pedido-manual",
    title: "Apuntar un pedido por teléfono o en mostrador",
    keys: ["pedido telefono", "telefono", "mostrador", "pedido a mano", "apuntar pedido", "sin cobrar"],
    answer: "Menú → Caja: eliges los productos, si es de mostrador o por teléfono, para recoger o a domicilio, y cómo ha pagado. En Pedidos sale con la etiqueta «Mostrador» o «Teléfono».",
  },
  {
    id: "cancelar",
    title: "Cancelar o devolver un pedido",
    keys: ["cancelar", "anular", "devolver", "reembolso", "devolucion", "pedido equivocado"],
    answer: "Pedidos → en la tarjeta del pedido, «Cancelar» (te pide confirmarlo). Si se pagó con tarjeta online, la devolución se hace desde ahí mismo o en tu pasarela de pago. Si ya tenía factura, se emite la rectificativa sola.",
  },
  {
    id: "cocina",
    title: "Pantalla de cocina",
    keys: ["pantalla de cocina", "kds", "cocina", "tablet cocina", "marcar listo"],
    answer: "Menú → Día a día → Pantalla de cocina, en una tablet en la cocina. «Empezar» pasa el pedido a preparación y «✓ Listo» lo marca listo y avisa al cliente.",
  },
  {
    id: "reservas",
    title: "Reservas de mesa",
    keys: ["reserva", "reservas", "aforo", "turno", "reservar"],
    answer: "Las reservas del día están en Día a día → Reservas. Horas, aforo y duración se ajustan en Configuración → Reservas.",
  },
  {
    id: "promos",
    title: "Promociones, cupones y puntos",
    keys: ["promocion", "promo", "cupon", "descuento", "oferta", "fidelizacion", "puntos", "2x1", "codigo descuento"],
    answer: "Clientes → Promociones para descuentos y cupones (con fechas y condiciones); Clientes → Fidelización para los puntos y premios.",
  },
  {
    id: "regalo",
    title: "Tarjetas regalo",
    keys: ["tarjeta regalo", "regalo", "saldo", "bono"],
    answer: "Configuración → Tarjetas regalo: créalas con su saldo; el cliente las canjea al pedir con el código.",
  },
  {
    id: "colaboradores",
    title: "Colaboradores (hoteles, RRPP, pubs)",
    keys: ["colaborador", "rrpp", "hotel", "comision", "codigo colaborador", "relaciones publicas"],
    answer: "Colaboradores → Nuevo colaborador: nombre, dónde trabaja, su código y su %. Cada mes ves cuánto le toca por los pedidos que traen su código.",
  },
  {
    id: "stock",
    title: "Stock, inventario y mínimos",
    keys: ["stock", "inventario", "recuento", "minimo", "ingrediente", "falta", "almacen", "merma"],
    answer: "Costes → Inventario: haz el recuento (también dictándolo con la voz) y pon el mínimo de cada ingrediente para que te avise. Las compras que entran se apuntan en Costes → Compras y suman stock solas.",
  },
  {
    id: "escandallo",
    title: "Escandallos y coste de cada plato",
    keys: ["escandallo", "coste", "food cost", "margen", "rentabilidad", "receta", "gramaje", "cuanto me cuesta"],
    answer: "Costes → Escandallos: pon los gramos de cada ingrediente del plato y te da el coste y el margen. Costes → Rentabilidad te enseña qué platos dejan más y cuáles menos.",
  },
  {
    id: "informes",
    title: "Informes de ventas",
    keys: ["informe", "ventas del mes", "exportar", "excel", "estadisticas", "resumen"],
    answer: "Informes: elige las fechas y ves total, pedidos, ticket medio, canales y productos. También me lo puedes preguntar aquí («¿cuánto vendí el mes pasado?»).",
  },
  {
    id: "facturas",
    title: "Facturas y VeriFactu",
    keys: ["factura", "verifactu", "hacienda", "aeat", "certificado", "factura completa", "nif cliente", "rectificativa"],
    answer: "Las facturas emitidas están en Día a día → Facturas (ahí también haces una factura completa con el NIF del cliente). El envío a Hacienda y el certificado digital se configuran en Configuración → Facturación · VeriFactu.",
  },
  {
    id: "pagos",
    title: "Cobrar online (tarjeta y Bizum)",
    keys: ["pago online", "tarjeta", "bizum", "redsys", "stripe", "pasarela", "cobrar online", "tpv virtual"],
    answer: "Configuración → Pagos: conecta tu pasarela (Redsys para tarjeta y Bizum, o Stripe) con los datos que te da tu banco. Qué ve el cliente al pagar se cambia en Configuración → Pantalla de pago.",
  },
  {
    id: "marca",
    title: "Logo, colores y aspecto de la tienda",
    keys: ["logo", "colores", "marca", "aspecto", "diseño tienda", "fuente", "portada", "personalizar"],
    answer: "Configuración → Marca para logo, colores y fuentes.",
  },
  {
    id: "datos-negocio",
    title: "Datos fiscales del negocio",
    keys: ["nif", "razon social", "direccion", "datos fiscales", "telefono del local", "aviso legal"],
    answer: "Configuración → Información del negocio: razón social, NIF, dirección y contacto. Los textos legales están en Configuración → Políticas.",
  },
  {
    id: "dominio",
    title: "Dirección web de la tienda",
    keys: ["dominio", "web", "enlace tienda", "url", "direccion web", "qr"],
    answer: "Configuración → Dominios: tu dirección de la tienda y, si quieres, tu dominio propio. El QR a tu tienda puede salir en el ticket (Configuración → Ticket).",
  },
  {
    id: "avisos",
    title: "Avisos y sonido de pedidos nuevos",
    keys: ["sonido", "campanilla", "aviso", "notificacion", "no suena", "alerta"],
    answer: "Si no suena: toca una vez «🔔 Toca para activar el sonido» (los navegadores lo exigen) y sube el volumen del dispositivo. Qué avisos recibes tú y tus clientes se cambia en Configuración → Notificaciones.",
  },
];

// Minúsculas, sin tildes ni signos.
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const STOP = new Set(["como", "donde", "que", "para", "una", "uno", "los", "las", "del", "con", "por", "puedo", "hago", "hacer", "quiero", "esta", "este", "se", "el", "la", "de", "en", "mi", "un", "y", "o", "a", "es", "me", "lo"]);

// Las entradas que mejor encajan con la pregunta (como mucho 3).
export function searchGuide(question: string, max = 3): GuideEntry[] {
  const q = ` ${normalize(question)} `;
  const words = q.split(" ").filter((w) => w.length > 2 && !STOP.has(w));
  return GUIDE.map((e) => {
    let score = 0;
    for (const k of e.keys) {
      const nk = normalize(k);
      if (q.includes(` ${nk} `) || q.includes(` ${nk}s `)) score += 3 + nk.split(" ").length;
      else if (nk.length > 4 && q.includes(nk)) score += 2;
    }
    const title = normalize(e.title);
    for (const w of words) if (title.includes(w)) score += 1;
    return { e, score };
  })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.e);
}
