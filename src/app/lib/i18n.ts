// Idiomas de la tienda pública (carta, checkout, seguimiento). Los textos de la
// web viven aquí; los de la carta (productos, opciones…) en el campo
// `translations` de cada fila, generados con IA desde el panel.
// Ver docs/CARTA-IDIOMAS.md

export type Lang = "es" | "en";
export const LANGS: Lang[] = ["es", "en"];
export const LANG_COOKIE = "pedir_lang";

// Idioma de la visita: el que eligió el cliente (cookie) o, si no eligió, el
// de su navegador. Solo inglés si el restaurante lo tiene activado.
export function pickLang(cookie: string | undefined, acceptLanguage: string | null, enabled: Lang[]): Lang {
  if (!enabled.includes("en")) return "es";
  if (cookie === "es" || cookie === "en") return cookie;
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first && !first.startsWith("es") && !first.startsWith("ca") && !first.startsWith("gl") && !first.startsWith("eu") ? "en" : "es";
}

// Guarda la elección del cliente (cookie de preferencia, técnica: 1 año).
export function rememberLang(lang: Lang): void {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

export function enabledLangs(settings: unknown): Lang[] {
  const l = (settings as Record<string, unknown> | null)?.languages;
  return Array.isArray(l) && l.includes("en") ? ["es", "en"] : ["es"];
}

// Texto traducido de un campo de la carta, o el original en español.
export type Translations = Partial<Record<Lang, Record<string, string>>>;
export function tr(translations: unknown, lang: Lang, field: string, original: string): string;
export function tr(translations: unknown, lang: Lang, field: string, original: string | null): string | null;
export function tr(translations: unknown, lang: Lang, field: string, original: string | null): string | null {
  if (lang === "es") return original;
  const v = (translations as Translations | null)?.[lang]?.[field];
  return typeof v === "string" && v.trim() ? v : original;
}

const euros = (cents: number) => (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

// ── Textos de la web ──────────────────────────────────────────────────────
const es = {
  // cabecera y portada
  open: "Abierto",
  closed: "Cerrado",
  order: "Pedido",
  delivery: "A domicilio",
  deliveryAndPickup: "Delivery y recogida",
  deliveryOnly: "Delivery",
  pickupOnly: "Solo recogida",
  pickupPlatforms: "Recogida · a domicilio con plataformas",
  onlineOrders: "Pedidos online",
  tagline: "Elige, personaliza y te lo preparamos al momento.",
  seeMenu: "Ver la carta",
  closedOpens: (when: string) => `abrimos ${when}`,
  canSchedule: "Puedes programar tu pedido",
  categories: "Categorías",
  // a domicilio con plataformas
  alsoInYourApp: "También en tu app",
  chooseCourier: "Escoge quién te lo lleva",
  alsoInYourAppText: "Si lo prefieres, pídenos en tu app de siempre.",
  courierText: "Te llevamos a nuestra tienda en esa app, donde haces el pedido y el pago. Para recoger, pide aquí.",
  // promociones y sellos
  promotions: "Promociones",
  favorites: "Nuestros favoritos",
  badgeFeatured: "Recomendado",
  badgeBestSeller: "Lo más pedido",
  freeDelivery: "Envío gratis",
  athome: "a domicilio",
  onYourOrder: "en tu pedido",
  appliesAlone: "se aplica sola",
  stampCard: "Tarjeta de sellos",
  thisOrderHasReward: "¡Este pedido tiene premio!",
  cardComplete: "¡Tarjeta completa!",
  stampsSoFar: (n: number, of: number) => `Con este pedido llevas ${n} de ${of}`,
  stampsIntro: (n: number) => `En tu ${n}.º pedido. Cada pedido suma un sello con tu teléfono, sin registrarte.`,
  nextOrderReward: (r: string) => `En tu próximo pedido: ${r}`,
  inOrderN: (n: number, r: string) => `En tu ${n}.º pedido: ${r}`,
  // tarjetas
  menuBadge: "Menú",
  inYourOrder: (n: number) => `${n} en tu pedido`,
  allFor: "Todo por",
  buildMenu: "Montar mi menú →",
  add: "Añadir",
  addX: (x: string) => `Añadir ${x}`,
  removeOne: (x: string) => `Quitar un ${x}`,
  quantity: "Cantidad",
  vegan: "Vegano",
  vegetarian: "Vegetariano",
  seeDetails: (x: string) => `Ver ${x}`,
  addShort: (p: string) => `Añadir · ${p}`,
  search: "Buscar en la carta",
  searchPlaceholder: "Busca un plato, una bebida…",
  searchResults: (n: number) => (n === 1 ? "1 resultado" : `${n} resultados`),
  noResults: (q: string) => `No encontramos «${q}». Prueba con otra palabra.`,
  addAnother: (x: string) => `Añadir otro ${x}`,
  allergens: "Alérgenos",
  menuSteps: "Pasos del menú",
  // barra del pedido
  items: (n: number) => `${n} ${n === 1 ? "artículo" : "artículos"}`,
  clear: "Vaciar",
  clearOrder: "Vaciar pedido",
  addMore: "Añadir más",
  viewOrder: "Ver pedido →",
  // hojas de opciones / combo
  close: "Cerrar",
  required: "Obligatorio",
  optionalMulti: "Opcional · elige las que quieras",
  optional: "Opcional",
  included: "Incluido",
  recommended: "Recomendado",
  addToOrder: (p: string) => `Añadir al pedido · ${p}`,
  each: (p: string) => ` · +${p} cada una`,
  nOptions: (n: number) => `${n} opciones`,
  chooseOption: (g: string) => `${g}: elige una opción`,
  maxN: (g: string, n: number) => `${g}: máximo ${n}`,
  menuLabel: (p: string) => `Menú · ${p}`,
  change: "Cambiar",
  chooseOne: "Elige uno",
  noOptionsNow: "Ahora mismo no hay opciones disponibles.",
  requiredLower: "obligatorio",
  optionalLower: "opcional",
  addMenu: (p: string) => `Añadir menú · ${p}`,
  chooseMore: (n: number, p: string) => `Elige ${n === 1 ? "1 opción más" : `${n} opciones más`} · ${p}`,
  // pie
  contact: "Contacto",
  hours: "Horario",
  info: "Información",
  askInStore: "Consulta en el local.",
  footerTagline: "Pide online y te lo preparamos al momento.",
  allergensFooter: "Alérgenos: consulta cada producto o pregúntanos.",
  reviews: "★ Reseñas",
  restaurantInfo: "Información del restaurante",
  // checkout
  confirmOrder: "Confirmar pedido",
  emptyCart: "Tu carrito está vacío",
  backToMenu: "Volver al menú",
  yourOrder: (n: number) => `Tu pedido · ${n} ${n === 1 ? "producto" : "productos"}`,
  subtotal: "Subtotal",
  deliveryFee: "Gastos de envío",
  byPostalCode: "Según código postal",
  free: "Gratis",
  total: "Total",
  couponTitle: "Cupón de descuento",
  apply: "Aplicar",
  remove: "Quitar",
  couponBelowMin: (p: string) => `Añade productos hasta ${p} para usarlo`,
  couponNotStack: (name: string) => `No se acumula: «${name}» te ahorra más y es la que se aplica`,
  rewardLine: (x: string) => `🎁 Premio: ${x} gratis`,
  addAlsoReward: (x: string) => `Añade también ${x}: entra en el premio.`,
  addForReward: (x: string) => `Añade ${x} para usarlo. Si no, lo guardamos para tu próximo pedido.`,
  mode: "Modalidad",
  pickup: "🏪 Recoger",
  deliveryBtn: "🛵 A domicilio",
  homeBtn: "🛵 A domicilio",
  courierNote: "El reparto lo hacen estas plataformas: el pedido y el pago se hacen en su app (tu carrito de aquí no se pasa). Para recoger, sigue aquí.",
  when: "¿Cuándo lo quieres?",
  asap: "⚡ Lo antes posible",
  aboutMin: (n: number) => `unos ${n} min`,
  schedule: "🕐 Programar",
  pickDayTime: "elige día y hora",
  deliveryTime: "Hora de entrega",
  pickupTime: "Hora de recogida",
  noSlots: "No hay horas disponibles para programar en los próximos días.",
  carouselPrev: "Menús anteriores",
  ok: "Aceptar",
  cancel: "Cancelar",
  carouselNext: "Más menús",
  timeRange: (a: string, b: string) => `Puedes elegir entre las ${a} y las ${b}.`,
  name: "Nombre *",
  yourName: "Tu nombre",
  phone: "Teléfono *",
  address: "Dirección de entrega *",
  addressPlaceholder: "Empieza a escribir: calle y número",
  floorInNotes: "Piso y puerta, en las notas.",
  postalCode: "Código postal *",
  weDeliverIn: (zone: string, fee: string, min: string | null) => `Repartimos en ${zone}: envío ${fee}${min ? ` · pedido mínimo ${min}` : ""}`,
  notDelivering: (cp: string) => `No repartimos en el ${cp}. Puedes pedir para recoger.`,
  notes: "Notas (opcional)",
  notesPlaceholder: "Sin cebolla, alergia a los frutos secos...",
  legalAccept: { before: "Al confirmar el pedido aceptas las ", terms: "condiciones de venta", and: " y la ", privacy: "política de privacidad", after: ", y declaras ser mayor de 18 años si pides bebidas con alcohol." },
  consent: "Quiero recibir ofertas y novedades de este restaurante por WhatsApp o SMS. Puedo darme de baja en cualquier momento.",
  willBeScheduled: (day: string, time: string) => `Tu pedido quedará programado para ${day} a las ${time}.`,
  minimumOrder: (min: string, left: string) => `El pedido mínimo a domicilio es de ${min}. Te faltan ${left}.`,
  sending: "Enviando pedido...",
  notAccepting: "Ahora mismo no aceptamos pedidos",
  scheduleOrder: (p: string) => `Programar pedido · ${p}`,
  confirmOrderTotal: (p: string) => `Confirmar pedido · ${p}`,
  invalidPhone: "Introduce un teléfono válido (9 dígitos, empieza por 6, 7, 8 o 9).",
  networkError: "Error de red. Inténtalo de nuevo.",
  tip: "Propina",
  tipTitle: "¿Quieres dejar propina?",
  noTip: "Sin propina",
  giftCard: "Tarjeta regalo",
  giftBalance: (p: string) => `Saldo disponible: ${p}`,
  giftCardError: "No se ha podido aplicar la tarjeta regalo",
  taxIncluded: (rate: number, p: string) => `IVA incluido (${rate} %): ${p}`,
  optionalStep: "Opcional",
  noThanks: "No, gracias",
  yourStore: "Tu local",
  pickupAt: (name: string) => `Recoges en ${name}`,
  howToPay: "¿Cómo pagas?",
  payCard: "Tarjeta",
  payCardHint: "Apple Pay y Google Pay incluidos",
  payBizum: "Bizum",
  payAtPickup: "Al recoger",
  payOnDelivery: "Al recibirlo",
  payInPerson: "Efectivo o tarjeta en el local",
  payNow: (p: string) => `Pagar ${p}`,
  goingToPay: "Te llevamos a la página de pago…",
  confirmingPayment: "Confirmando tu pago…",
  confirmingHelp: "Tarda unos segundos. No cierres esta página.",
  paymentFailed: "El pago no se ha completado",
  paymentFailedHelp: "No te hemos cobrado nada y el pedido no se ha enviado al restaurante. Puedes intentarlo de nuevo.",
  tryAgain: "Volver a intentarlo",
  paidByCard: "Pagado con tarjeta",
  paidByBizum: "Pagado con Bizum",
  testPaymentTitle: "Pago de prueba",
  testPaymentHelp: "Esto es un pago de prueba: no se cobra nada. Elige cómo quieres que termine.",
  testPayOk: "Pago correcto",
  testPayKo: "Pago rechazado",
  orderError: "Error al crear el pedido",
  couponError: "No se pudo aplicar el cupón",
  addressHint: "Añade el número del portal",
  addressPickHint: " · elige y añade el número",
  // confirmación y seguimiento
  orderReceived: "¡Pedido recibido!",
  reference: "Referencia: ",
  orderNotFound: "Pedido no encontrado",
  orderDetails: "Datos del pedido",
  nameLabel: "Nombre",
  phoneLabel: "Teléfono",
  typeLabel: "Tipo",
  addressLabel: "Dirección",
  pickupAtLabel: "Recoger en",
  howToGet: "Cómo llegar",
  confirmClear: "¿Vaciar el pedido?",
  haveCodeOrGift: "¿Tienes un cupón o una tarjeta regalo?",
  invoiceTitle: "Factura simplificada",
  invoiceCheck: "Comprobar en la Agencia Tributaria",
  invoiceRectified: (n: string) => `Anulada por devolución: rectificativa ${n}`,
  haveCode: "¿Tienes un cupón?",
  haveAnyCode: "¿Tienes un código?",
  codeTitle: "Código",
  codeNotFound: "Ese código no existe",
  collabApplied: "Código de colaborador",
  collabDiscountLine: (name: string, pct: string) => `Descuento de ${name} (${pct} %)`,
  collabDiscountHint: (pct: string) => `Te ahorras un ${pct} %`,
  haveGift: "¿Tienes una tarjeta regalo?",
  notesLabel: "Notas",
  products: "Productos",
  shipping: "Envío",
  orderAgain: "Hacer otro pedido",
  orderStatus: "Estado del pedido",
  arrivesAt: "Llega hacia las ",
  readyAt: "Listo hacia las ",
  notifyMe: (what: string) => `🔔 Avisarme cuando esté ${what}`,
  onTheWay: "de camino",
  ready: "listo",
  notifyOn: "🔔 Te avisaremos aquí cuando cambie el estado. Deja esta página abierta.",
  notifyBlocked: "Has bloqueado los avisos. Esta página se actualiza sola.",
  autoUpdates: "Esta página se actualiza sola.",
  cancelled: "Tu pedido se ha cancelado",
  cancelledHelp: "Si tienes cualquier duda, llama al restaurante.",
  cancelledByYou: "Has cancelado tu pedido",
  cancelledRefund: "Si pagaste online, el importe vuelve a tu tarjeta en unos días.",
  cancelOrder: "Cancelar pedido",
  cancelWhile: "Puedes cancelar mientras el restaurante no haya empezado con tu pedido.",
  cancelScheduled: "Puedes cancelar hasta una hora antes de la hora elegida.",
  cancelWhy: "¿Por qué lo cancelas?",
  reasonMistake: "Me he equivocado",
  reasonAddressTime: "Dirección u hora incorrecta",
  reasonChangedMind: "Ya no lo quiero",
  cancelConfirm: "Sí, cancelar el pedido",
  cancelKeep: "No, lo mantengo",
  cancelling: "Cancelando…",
  cancelFailed: "No se ha podido cancelar. Llama al restaurante.",
  anyProblem: "¿Algún problema con tu pedido?",
  callRestaurant: "Llama al restaurante",
  tooLateCancel: "El restaurante ya ha empezado con tu pedido. Si necesitas cambiar algo, llámalo.",
  thanksReview: "¡Gracias por tu valoración!",
  googleAsk: "¿Nos ayudas contándolo también en Google? Son 20 segundos.",
  googleBtn: "★ Dejar reseña en Google",
  sorry: "Sentimos que no haya sido perfecto. El restaurante leerá tu comentario.",
  howWasIt: "¿Qué tal tu pedido?",
  stars: (n: number) => `${n} ${n === 1 ? "estrella" : "estrellas"}`,
  likedMost: "¿Qué es lo que más te ha gustado? (opcional)",
  improve: "¿Qué podemos mejorar? (opcional)",
  sendReview: "Enviar valoración",
  sendingReview: "Enviando…",
  pickStars: "Elige de 1 a 5 estrellas",
  progress: "Progreso del pedido",
  language: "Idioma",
  nth: (n: number) => `${n}.º`,
};

export type UiText = typeof es;

const en: UiText = {
  open: "Open",
  closed: "Closed",
  order: "Order",
  delivery: "Delivery",
  deliveryAndPickup: "Delivery and pickup",
  deliveryOnly: "Delivery",
  pickupOnly: "Pickup only",
  pickupPlatforms: "Pickup · delivery via apps",
  onlineOrders: "Online ordering",
  tagline: "Choose, customise and we'll make it fresh for you.",
  seeMenu: "See the menu",
  closedOpens: (when: string) => `we open ${when}`,
  canSchedule: "You can schedule your order",
  categories: "Categories",
  alsoInYourApp: "Also in your app",
  chooseCourier: "Choose who delivers it",
  alsoInYourAppText: "If you prefer, order from us in your usual app.",
  courierText: "We'll take you to our store in that app, where you order and pay. For pickup, order here.",
  promotions: "Offers",
  favorites: "Our favourites",
  badgeFeatured: "Recommended",
  badgeBestSeller: "Most ordered",
  freeDelivery: "Free delivery",
  athome: "for delivery",
  onYourOrder: "off your order",
  appliesAlone: "applied automatically",
  stampCard: "Stamp card",
  thisOrderHasReward: "This order has a reward!",
  cardComplete: "Card complete!",
  stampsSoFar: (n: number, of: number) => `With this order you'll have ${n} of ${of}`,
  stampsIntro: (n: number) => `On your ${ordinal(n)} order. Every order adds a stamp to your phone number, no sign-up.`,
  nextOrderReward: (r: string) => `On your next order: ${r}`,
  inOrderN: (n: number, r: string) => `On your ${ordinal(n)} order: ${r}`,
  menuBadge: "Meal deal",
  inYourOrder: (n: number) => `${n} in your order`,
  allFor: "All for",
  buildMenu: "Build my meal →",
  add: "Add",
  addX: (x: string) => `Add ${x}`,
  removeOne: (x: string) => `Remove one ${x}`,
  quantity: "Quantity",
  vegan: "Vegan",
  vegetarian: "Vegetarian",
  seeDetails: (x: string) => `See ${x}`,
  addShort: (p: string) => `Add · ${p}`,
  search: "Search the menu",
  searchPlaceholder: "Search a dish, a drink…",
  searchResults: (n: number) => (n === 1 ? "1 result" : `${n} results`),
  noResults: (q: string) => `No results for "${q}". Try another word.`,
  addAnother: (x: string) => `Add another ${x}`,
  allergens: "Allergens",
  menuSteps: "Meal steps",
  items: (n: number) => `${n} ${n === 1 ? "item" : "items"}`,
  clear: "Clear",
  clearOrder: "Clear order",
  addMore: "Add more",
  viewOrder: "View order →",
  close: "Close",
  required: "Required",
  optionalMulti: "Optional · choose any",
  optional: "Optional",
  included: "Included",
  recommended: "Recommended",
  addToOrder: (p: string) => `Add to order · ${p}`,
  each: (p: string) => ` · +${p} each`,
  nOptions: (n: number) => `${n} options`,
  chooseOption: (g: string) => `${g}: please choose an option`,
  maxN: (g: string, n: number) => `${g}: up to ${n}`,
  menuLabel: (p: string) => `Meal deal · ${p}`,
  change: "Change",
  chooseOne: "Choose one",
  noOptionsNow: "No options available right now.",
  requiredLower: "required",
  optionalLower: "optional",
  addMenu: (p: string) => `Add meal · ${p}`,
  chooseMore: (n: number, p: string) => `Choose ${n === 1 ? "1 more" : `${n} more`} · ${p}`,
  contact: "Contact",
  hours: "Opening hours",
  info: "Information",
  askInStore: "Ask in the restaurant.",
  footerTagline: "Order online and we'll make it fresh for you.",
  allergensFooter: "Allergens: check each product or ask us.",
  reviews: "★ Reviews",
  restaurantInfo: "Restaurant information",
  confirmOrder: "Confirm order",
  emptyCart: "Your basket is empty",
  backToMenu: "Back to the menu",
  yourOrder: (n: number) => `Your order · ${n} ${n === 1 ? "item" : "items"}`,
  subtotal: "Subtotal",
  deliveryFee: "Delivery fee",
  byPostalCode: "Depends on postcode",
  free: "Free",
  total: "Total",
  couponTitle: "Discount code",
  apply: "Apply",
  remove: "Remove",
  couponBelowMin: (p: string) => `Add products up to ${p} to use it`,
  couponNotStack: (name: string) => `Not combinable: “${name}” saves you more and is the one applied`,
  rewardLine: (x: string) => `🎁 Reward: free ${x}`,
  addAlsoReward: (x: string) => `Also add ${x}: it's part of the reward.`,
  addForReward: (x: string) => `Add ${x} to use it. Otherwise we'll keep it for your next order.`,
  mode: "How",
  pickup: "🏪 Pickup",
  deliveryBtn: "🛵 Delivery",
  homeBtn: "🛵 Delivery",
  courierNote: "Delivery is done by these apps: you order and pay in their app (your basket here isn't transferred). For pickup, carry on here.",
  when: "When do you want it?",
  asap: "⚡ As soon as possible",
  aboutMin: (n: number) => `about ${n} min`,
  schedule: "🕐 Schedule",
  pickDayTime: "choose day and time",
  deliveryTime: "Delivery time",
  pickupTime: "Pickup time",
  noSlots: "No times available to schedule in the next few days.",
  carouselPrev: "Previous menus",
  ok: "OK",
  cancel: "Cancel",
  carouselNext: "More menus",
  timeRange: (a: string, b: string) => `You can choose between ${a} and ${b}.`,
  name: "Name *",
  yourName: "Your name",
  phone: "Phone *",
  address: "Delivery address *",
  addressPlaceholder: "Start typing: street and number",
  floorInNotes: "Floor and door number in the notes.",
  postalCode: "Postcode *",
  weDeliverIn: (zone: string, fee: string, min: string | null) => `We deliver to ${zone}: delivery ${fee}${min ? ` · minimum order ${min}` : ""}`,
  notDelivering: (cp: string) => `We don't deliver to ${cp}. You can order for pickup.`,
  notes: "Notes (optional)",
  notesPlaceholder: "No onion, nut allergy...",
  legalAccept: { before: "By placing your order you accept the ", terms: "terms of sale", and: " and the ", privacy: "privacy policy", after: ", and confirm you are 18 or older if you order alcoholic drinks." },
  consent: "I'd like to receive offers and news from this restaurant by WhatsApp or SMS. I can unsubscribe at any time.",
  willBeScheduled: (day: string, time: string) => `Your order will be scheduled for ${day} at ${time}.`,
  minimumOrder: (min: string, left: string) => `The minimum delivery order is ${min}. You need ${left} more.`,
  sending: "Sending order...",
  notAccepting: "We're not taking orders right now",
  scheduleOrder: (p: string) => `Schedule order · ${p}`,
  confirmOrderTotal: (p: string) => `Confirm order · ${p}`,
  invalidPhone: "Please enter a valid Spanish phone number (9 digits, starting with 6, 7, 8 or 9).",
  networkError: "Network error. Please try again.",
  tip: "Tip",
  tipTitle: "Would you like to leave a tip?",
  noTip: "No tip",
  giftCard: "Gift card",
  giftBalance: (p: string) => `Available balance: ${p}`,
  giftCardError: "The gift card couldn't be applied",
  taxIncluded: (rate: number, p: string) => `VAT included (${rate}%): ${p}`,
  optionalStep: "Optional",
  noThanks: "No, thanks",
  yourStore: "Your restaurant",
  pickupAt: (name: string) => `Pick up at ${name}`,
  howToPay: "How would you like to pay?",
  payCard: "Card",
  payCardHint: "Apple Pay and Google Pay included",
  payBizum: "Bizum",
  payAtPickup: "On pickup",
  payOnDelivery: "On delivery",
  payInPerson: "Cash or card in person",
  payNow: (p: string) => `Pay ${p}`,
  goingToPay: "Taking you to the payment page…",
  confirmingPayment: "Confirming your payment…",
  confirmingHelp: "It takes a few seconds. Please don't close this page.",
  paymentFailed: "The payment didn't go through",
  paymentFailedHelp: "You haven't been charged and the order hasn't been sent to the restaurant. You can try again.",
  tryAgain: "Try again",
  paidByCard: "Paid by card",
  paidByBizum: "Paid with Bizum",
  testPaymentTitle: "Test payment",
  testPaymentHelp: "This is a test payment: nothing is charged. Choose how you want it to end.",
  testPayOk: "Payment successful",
  testPayKo: "Payment declined",
  orderError: "The order could not be placed",
  couponError: "The code could not be applied",
  addressHint: "Add the street number",
  addressPickHint: " · choose and add the number",
  orderReceived: "Order received!",
  reference: "Reference: ",
  orderNotFound: "Order not found",
  orderDetails: "Order details",
  nameLabel: "Name",
  phoneLabel: "Phone",
  typeLabel: "Type",
  addressLabel: "Address",
  pickupAtLabel: "Pick up at",
  howToGet: "Directions",
  confirmClear: "Empty your basket?",
  haveCodeOrGift: "Have a coupon or gift card?",
  invoiceTitle: "Simplified invoice",
  invoiceCheck: "Verify with the Spanish Tax Agency",
  invoiceRectified: (n: string) => `Refunded: corrective invoice ${n}`,
  haveCode: "Have a coupon?",
  haveAnyCode: "Have a code?",
  codeTitle: "Code",
  codeNotFound: "That code doesn't exist",
  collabApplied: "Partner code",
  collabDiscountLine: (name: string, pct: string) => `${name}'s discount (${pct}%)`,
  collabDiscountHint: (pct: string) => `You save ${pct}%`,
  haveGift: "Have a gift card?",
  notesLabel: "Notes",
  products: "Products",
  shipping: "Delivery",
  orderAgain: "Place another order",
  orderStatus: "Order status",
  arrivesAt: "Arrives around ",
  readyAt: "Ready around ",
  notifyMe: (what: string) => `🔔 Notify me when it's ${what}`,
  onTheWay: "on its way",
  ready: "ready",
  notifyOn: "🔔 We'll notify you here when the status changes. Keep this page open.",
  notifyBlocked: "You've blocked notifications. This page updates by itself.",
  autoUpdates: "This page updates by itself.",
  cancelled: "Your order has been cancelled",
  cancelledHelp: "If you have any questions, please call the restaurant.",
  cancelledByYou: "You cancelled your order",
  cancelledRefund: "If you paid online, the amount goes back to your card within a few days.",
  cancelOrder: "Cancel order",
  cancelWhile: "You can cancel until the restaurant starts preparing your order.",
  cancelScheduled: "You can cancel up to one hour before the time you chose.",
  cancelWhy: "Why are you cancelling?",
  reasonMistake: "I made a mistake",
  reasonAddressTime: "Wrong address or time",
  reasonChangedMind: "I no longer want it",
  cancelConfirm: "Yes, cancel the order",
  cancelKeep: "No, keep it",
  cancelling: "Cancelling…",
  cancelFailed: "The order could not be cancelled. Please call the restaurant.",
  anyProblem: "Any problem with your order?",
  callRestaurant: "Call the restaurant",
  tooLateCancel: "The restaurant has already started your order. If you need to change anything, please call them.",
  thanksReview: "Thanks for your rating!",
  googleAsk: "Would you share it on Google too? It takes 20 seconds.",
  googleBtn: "★ Review us on Google",
  sorry: "We're sorry it wasn't perfect. The restaurant will read your comment.",
  howWasIt: "How was your order?",
  stars: (n: number) => `${n} ${n === 1 ? "star" : "stars"}`,
  likedMost: "What did you like most? (optional)",
  improve: "What could we improve? (optional)",
  sendReview: "Send rating",
  sendingReview: "Sending…",
  pickStars: "Choose 1 to 5 stars",
  progress: "Order progress",
  language: "Language",
  nth: (n: number) => ordinal(n),
};

export function ui(lang: Lang): UiText {
  return lang === "en" ? en : es;
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

// ── Frases que el servidor genera en español (estado del local, días) ─────
const DAYS_EN: Record<string, string> = {
  lunes: "Monday", martes: "Tuesday", miércoles: "Wednesday", jueves: "Thursday", viernes: "Friday", sábado: "Saturday", sábados: "Saturdays", domingo: "Sunday", domingos: "Sundays",
  Lunes: "Monday", Martes: "Tuesday", Miércoles: "Wednesday", Jueves: "Thursday", Viernes: "Friday", Sábado: "Saturday", Domingo: "Sunday",
};
const MONTHS_EN: Record<string, string> = {
  enero: "January", febrero: "February", marzo: "March", abril: "April", mayo: "May", junio: "June",
  julio: "July", agosto: "August", septiembre: "September", octubre: "October", noviembre: "November", diciembre: "December",
};

// "hoy a las 20:00" → "today at 20:00"; "el sábado a las 13:00" → "on Saturday at 13:00".
export function whenText(s: string | null, lang: Lang): string | null {
  if (!s || lang === "es") return s;
  return s
    .replace(/^hoy a las/, "today at")
    .replace(/^mañana a las/, "tomorrow at")
    .replace(/^a las/, "at")
    .replace(/^el (\d+) de (\w+) a las/, (_, d, m) => `on ${MONTHS_EN[m] ?? m} ${d} at`)
    .replace(/^el (\S+) a las/, (_, d) => `on ${DAYS_EN[d] ?? d} at`);
}

export function storeMessage(kind: string, message: string, lang: Lang): string {
  if (lang === "es") return message;
  if (kind === "paused") return "We're not taking orders right now";
  if (kind === "hours") return "We're closed right now";
  if (kind === "closure") return message.startsWith("Cerrado: ") ? `Closed: ${message.slice(9)}` : "Temporarily closed";
  return "Open";
}

// Día de un hueco para programar: "Hoy" / "Mañana" / "Sábado 18".
export function slotDay(day: string, lang: Lang): string {
  if (lang === "es") return day;
  if (day === "Hoy") return "Today";
  if (day === "Mañana") return "Tomorrow";
  const [d, n] = day.split(" ");
  return `${DAYS_EN[d] ?? d} ${n ?? ""}`.trim();
}

export function dayName(day: string, lang: Lang): string {
  return lang === "es" ? day : DAYS_EN[day] ?? day;
}

const ALLERGENS_EN: Record<string, string> = {
  Gluten: "Gluten", Crustáceos: "Crustaceans", Huevos: "Eggs", Pescado: "Fish", Cacahuetes: "Peanuts", Soja: "Soy", Lácteos: "Milk",
  "Frutos de cáscara": "Tree nuts", Apio: "Celery", Mostaza: "Mustard", Sésamo: "Sesame", Sulfitos: "Sulphites", Altramuces: "Lupin", Moluscos: "Molluscs",
};
export function allergenName(a: string, lang: Lang): string {
  return lang === "en" ? ALLERGENS_EN[a] ?? a : a;
}

// Mensajes de validación de opciones (menuOptions / combos) en inglés.
export function optionError(msg: string, lang: Lang): string {
  if (lang === "es") return msg;
  return msg
    .replace(/: elige una opción$/, ": please choose an option")
    .replace(/: máximo (\d+)$/, ": up to $1")
    .replace(/: opción no válida$/, ": invalid option")
    .replace(/: esa opción ya no está disponible$/, ": that option is no longer available")
    .replace(/: elige una opción en cada paso$/, ": choose an option in every step");
}

export function formatEuros(cents: number): string {
  return euros(cents);
}
