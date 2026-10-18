// Textos legales de la tienda, generados con los datos del negocio. Son una
// plantilla orientativa (LSSI, RGPD/LOPDGDD, cookies y consumidores): el panel
// recomienda que los revise un asesor. Ver docs/DATOS-NEGOCIO-Y-LEGAL.md
import { fullAddress, type BusinessInfo, type LegalSlug } from "@/app/lib/business";

export type LegalSection = { heading: string; paragraphs: string[] };

const or = (v: string | null, fallback: string) => v ?? fallback;

export function legalText(doc: LegalSlug, b: BusinessInfo, brand: string, siteUrl: string): LegalSection[] {
  const holder = or(b.legalName, `[Razón social de ${brand}]`);
  const nif = or(b.taxId, "[NIF]");
  const address = or(fullAddress(b), "[Dirección]");
  const email = or(b.email, "[email de contacto]");
  const phone = or(b.phone, "[teléfono]");

  if (doc === "aviso-legal") {
    return [
      {
        heading: "Datos del titular",
        paragraphs: [
          `En cumplimiento de la Ley 34/2002, de Servicios de la Sociedad de la Información (LSSI), se informa de que esta tienda online (${siteUrl}) pertenece a ${holder}, con NIF ${nif} y domicilio en ${address}.`,
          `Contacto: ${email} · ${phone}.${b.registry ? ` ${b.registry}.` : ""}`,
        ],
      },
      {
        heading: "Objeto",
        paragraphs: [`Esta web permite consultar la carta de ${brand} y hacer pedidos para recoger en el local o, cuando esté disponible, a domicilio.`],
      },
      {
        heading: "Responsabilidad y uso",
        paragraphs: [
          "El titular procura que la información de la carta (productos, precios, alérgenos y disponibilidad) sea exacta y esté actualizada, y la corrige en cuanto detecta un error.",
          "El usuario se compromete a hacer un uso correcto de la web y a facilitar datos verdaderos al hacer un pedido.",
        ],
      },
      {
        heading: "Propiedad intelectual",
        paragraphs: [`La marca, el logotipo, las fotografías y los textos de ${brand} pertenecen a su titular. No se pueden reproducir sin su autorización.`],
      },
      { heading: "Legislación aplicable", paragraphs: ["Estas condiciones se rigen por la legislación española."] },
    ];
  }

  if (doc === "privacidad") {
    return [
      {
        heading: "Responsable del tratamiento",
        paragraphs: [`${holder} (NIF ${nif}), ${address}. Contacto para cualquier cuestión sobre tus datos: ${email}.`],
      },
      {
        heading: "Qué datos tratamos y para qué",
        paragraphs: [
          "Gestionar tu pedido: nombre, teléfono y, si es a domicilio, la dirección de entrega. Base legal: la ejecución del contrato (el pedido).",
          "Tarjeta de sellos y promociones: tu historial de pedidos asociado a tu teléfono, para aplicarte premios y descuentos. Base legal: la relación contractual y el interés legítimo en premiar a los clientes habituales.",
          "Ofertas y novedades por WhatsApp o SMS: solo si marcas la casilla al pedir. Base legal: tu consentimiento, que puedes retirar en cualquier momento respondiendo BAJA o escribiendo a " + email + ".",
          "Valoraciones: la puntuación y el comentario que dejes al recibir el pedido, para mejorar el servicio.",
        ],
      },
      {
        heading: "Cuánto tiempo los guardamos",
        paragraphs: ["Los datos de los pedidos se conservan el tiempo necesario para atenderlos y durante los plazos que exige la ley (por ejemplo, fiscales). Los de ofertas, hasta que retires tu consentimiento."],
      },
      {
        heading: "Con quién se comparten",
        paragraphs: [
          "No se venden ni se ceden a terceros. Los tratan, por cuenta del restaurante y con las garantías del RGPD, los proveedores tecnológicos que alojan la tienda y la base de datos.",
          "Si pides a domicilio a través de una plataforma de reparto (Glovo, Uber Eats, Just Eat…), el pedido se rige por la política de privacidad de esa plataforma.",
          "Si pagas online, los datos de tu tarjeta los trata directamente la pasarela de pago del restaurante (su banco o Stripe), no esta tienda.",
          "Si pides a domicilio en esta tienda y el restaurante usa un servicio de reparto externo (por ejemplo, Glovo On-Demand), se le comunican tu nombre, tu teléfono y tu dirección de entrega solo para llevarte el pedido.",
        ],
      },
      {
        heading: "Seguridad",
        paragraphs: ["Aplicamos medidas técnicas y organizativas para proteger tus datos: conexión cifrada (https), acceso al panel solo con usuario y contraseña, y permisos distintos para el personal (por ejemplo, la cocina solo ve los pedidos)."],
      },
      {
        heading: "Tus derechos",
        paragraphs: [
          `Puedes pedir acceso, rectificación, supresión, oposición, limitación y portabilidad de tus datos escribiendo a ${email}. Si crees que no se han atendido bien, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).`,
        ],
      },
    ];
  }

  if (doc === "cookies") {
    return [
      {
        heading: "Qué usamos",
        paragraphs: [
          "Esta tienda solo usa almacenamiento técnico imprescindible para que funcione: recordar tu pedido mientras lo preparas (carrito), el idioma que eliges (cookie «pedir_lang», un año) y, si lo activas, el aviso de estado de tu pedido.",
          "No usamos cookies de publicidad ni de analítica de terceros. Por eso no te pedimos que las aceptes: las técnicas están exentas de consentimiento (art. 22.2 LSSI).",
        ],
      },
      {
        heading: "Cómo borrarlas",
        paragraphs: ["Puedes borrar estos datos en cualquier momento desde la configuración de tu navegador. El carrito se vaciará."],
      },
    ];
  }

  // Condiciones de venta
  return [
    {
      heading: "Quién vende",
      paragraphs: [`${holder} (NIF ${nif}), ${address}. Contacto: ${email} · ${phone}.`],
    },
    {
      heading: "Pedidos y precios",
      paragraphs: [
        "Los precios de la carta incluyen el IVA. Los gastos de envío, si los hay, se muestran antes de confirmar el pedido.",
        "El pedido queda hecho al confirmarlo y el restaurante lo acepta desde su panel. Si no se pudiera preparar (por ejemplo, por falta de un producto), te avisaremos para cambiarlo o cancelarlo.",
        "Los pedidos programados se preparan para la hora elegida, dentro del horario del local.",
        "Las fotografías de la carta son orientativas: la presentación puede variar ligeramente. Las cantidades y los ingredientes son los que indica cada producto.",
      ],
    },
    {
      heading: "Recogida y entrega a domicilio",
      paragraphs: [
        "Las horas de recogida y de entrega son estimadas y pueden variar en momentos de mucha demanda; te avisamos del estado del pedido en la página de seguimiento.",
        "Solo repartimos en las zonas y códigos postales que se indican al hacer el pedido. Indica bien la dirección (piso, puerta, indicaciones) y un teléfono en el que te podamos localizar.",
        "Si al entregar el pedido no hay nadie en la dirección indicada ni podemos contactar contigo, el pedido se considera entregado y no se reembolsa, salvo que se acuerde otra cosa con el restaurante.",
        "Revisa tu pedido al recibirlo. Si falta algo o hay algún error, avísanos en ese momento o lo antes posible para solucionarlo.",
      ],
    },
    {
      heading: "Bebidas alcohólicas",
      paragraphs: [
        "No se venden bebidas alcohólicas a menores de 18 años. Al recoger o al entregar el pedido se puede pedir un documento que acredite la edad; si no se muestra, esas bebidas no se entregan y se devuelve su importe.",
      ],
    },
    {
      heading: "Seguridad alimentaria",
      paragraphs: [
        "Nuestros productos se elaboran para consumirse en el momento. Si no los vas a tomar enseguida, guárdalos en el frigorífico y consúmelos en las siguientes 24 horas. El restaurante no responde del estado de los alimentos mal conservados después de la entrega.",
      ],
    },
    {
      heading: "Pago",
      paragraphs: [
        "Según lo que ofrezca la tienda al confirmar el pedido, puedes pagar online con tarjeta (o Bizum) o en el local / al recibir el pedido.",
        "Los pagos online los procesa la pasarela de pago del vendedor (por ejemplo, su banco a través de Redsys, o Stripe). Esta tienda no ve ni guarda los datos de tu tarjeta. El pedido solo se envía a cocina cuando la pasarela confirma el pago; si no se completa, no se te cobra nada.",
        "Si el vendedor cancela un pedido ya pagado, te devuelve el importe por el mismo medio de pago.",
      ],
    },
    {
      heading: "Cancelaciones, desistimiento y devoluciones",
      paragraphs: [
        "Puedes cancelar tu pedido llamando al restaurante mientras no se haya empezado a preparar. Si ya lo habías pagado online, te devolvemos el importe por el mismo medio de pago.",
        "Al tratarse de comida preparada y perecedera, no se aplica el derecho de desistimiento de 14 días (art. 103 d) del Real Decreto Legislativo 1/2007).",
        "Si el pedido llega incompleto, equivocado o en mal estado, te devolvemos el importe de lo afectado o te lo reponemos, a tu elección, siempre que nos avises en el momento de la entrega o lo antes posible.",
      ],
    },
    {
      heading: "Propinas y tarjetas regalo",
      paragraphs: [
        "La propina es voluntaria y va íntegra al equipo del restaurante.",
        "Las tarjetas regalo se canjean al pagar un pedido en esta tienda hasta agotar su saldo. No se pueden cambiar por dinero, y si tienen fecha de caducidad, se indica al emitirlas.",
      ],
    },
    {
      heading: "Alérgenos",
      paragraphs: [
        "La carta muestra los alérgenos de cada producto cuando el restaurante los ha indicado. Si tienes alguna alergia o intolerancia, indícalo en las notas del pedido o llama antes de pedir: en la cocina se manipulan alérgenos y puede haber trazas.",
      ],
    },
    {
      heading: "Reclamaciones",
      paragraphs: [
        `Para cualquier incidencia escribe a ${email} o llama al ${phone}. Te responderemos lo antes posible.`,
        "Tienes a tu disposición hojas de quejas y reclamaciones en el local.",
        "Si no llegamos a un acuerdo, puedes acudir a los servicios de consumo de tu ayuntamiento o comunidad autónoma, o al sistema arbitral de consumo.",
      ],
    },
  ];
}

// Texto editable (Configuración → Políticas): «## Título» y párrafos separados
// por una línea en blanco. Es el modelo que el dueño adapta a su negocio.
export function legalTemplate(doc: LegalSlug, b: BusinessInfo, brand: string, siteUrl: string): string {
  return legalText(doc, b, brand, siteUrl)
    .map((sec) => [`## ${sec.heading}`, ...sec.paragraphs].join("\n\n"))
    .join("\n\n");
}
