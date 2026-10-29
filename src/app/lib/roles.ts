// Roles del panel. Sin imports de Next: se puede usar en servidor y cliente.
//   SUPERADMIN    → todos los restaurantes
//   TENANT_ADMIN  → «Gerente»: todo su restaurante (carta, configuración, números…)
//   STORE_MANAGER → un empleado; lo que ve y hace depende de su puesto (position)
// Ver docs/USUARIOS-Y-PUESTOS.md

export function canManageTenant(role: string): boolean {
  return role === "SUPERADMIN" || role === "TENANT_ADMIN";
}

// Puestos del personal. Cada restaurante reparte así las tareas: la caja cobra,
// los camareros llevan las mesas, cocina y barra ven solo lo suyo.
export const POSITIONS = ["ENCARGADO", "CAJA", "CAMARERO", "COCINA", "BARRA"] as const;
export type Position = (typeof POSITIONS)[number];
export const asPosition = (v: unknown): Position | null => (POSITIONS.includes(v as Position) ? (v as Position) : null);

// Lo que se elige en Configuración → Usuarios: el gerente o un puesto.
export type Puesto = "GERENTE" | Position;
export const PUESTOS: { key: Puesto; label: string; hint: string }[] = [
  { key: "GERENTE", label: "Gerente", hint: "Todo el panel: carta, costes, clientes, configuración y usuarios." },
  { key: "ENCARGADO", label: "Encargado de sala", hint: "El día a día completo: Caja, Pedidos, Mesas y Facturas. Puede anular lo enviado a cocina, cancelar pedidos y cerrar mesas sin cobrar." },
  { key: "CAJA", label: "Caja", hint: "Cobra: Caja, Pedidos, Mesas y Facturas. Abre y cierra la caja." },
  { key: "CAMARERO", label: "Camarero", hint: "Mesas (abrir, tomar nota, pedir la cuenta y, si se le permite, cobrar) y Pedidos para entregar." },
  { key: "COCINA", label: "Cocina", hint: "Solo Pedidos, con los platos de sus secciones de la carta. Marca preparando y listo." },
  { key: "BARRA", label: "Barra", hint: "Solo Pedidos, con las bebidas y lo de sus secciones. Marca preparando y listo." },
];
export const puestoOf = (u: { role: string; position?: string | null }): Puesto => (canManageTenant(u.role) ? "GERENTE" : (asPosition(u.position) ?? "CAJA"));
export const puestoLabel = (u: { role: string; position?: string | null }) => (u.role === "SUPERADMIN" ? "Soporte de la plataforma" : PUESTOS.find((p) => p.key === puestoOf(u))!.label);

export type Access = {
  manager: boolean; // gerente: todo
  pedidos: boolean;
  caja: boolean;
  mesas: boolean;
  facturas: boolean;
  cobrar: boolean; // cobrar mesas y pedidos «al recoger»
  anular: boolean; // anular lo enviado a cocina, cerrar mesas sin cobrar, cancelar pedidos
  station: "COCINA" | "BARRA" | null; // vista de cocina o barra: solo sus líneas y solo preparar
  home: "home" | "pedidos" | "caja" | "mesas"; // a dónde va al entrar
};

export function accessOf(u: { role: string; position?: string | null; canCharge?: boolean | null }): Access {
  const puesto = puestoOf(u);
  const base = { manager: false, pedidos: true, caja: false, mesas: false, facturas: false, cobrar: false, anular: false, station: null };
  switch (puesto) {
    case "GERENTE":
      return { manager: true, pedidos: true, caja: true, mesas: true, facturas: true, cobrar: true, anular: true, station: null, home: "home" };
    case "ENCARGADO":
      return { ...base, caja: true, mesas: true, facturas: true, cobrar: true, anular: true, home: "caja" };
    case "CAJA":
      return { ...base, caja: true, mesas: true, facturas: true, cobrar: true, home: "caja" };
    case "CAMARERO":
      return { ...base, mesas: true, cobrar: u.canCharge !== false, home: "mesas" };
    case "COCINA":
    case "BARRA":
      return { ...base, station: puesto, home: "pedidos" };
  }
}

// Estados a los que cocina y barra pueden pasar un pedido: prepararlo y tenerlo listo.
export const STATION_STATUSES = ["ACCEPTED", "PREPARING", "READY"];

// Secciones de la carta que van a barra por defecto (el resto, a cocina).
const BAR_WORDS = /bebida|refresco|vino|cerveza|caf[eé]|c[oó]ctel|zumo|agua|licor|copa|batido|infusi[oó]n/i;
export function defaultStationCategories(station: "COCINA" | "BARRA", categories: { id: string; name: string }[]): string[] {
  return categories.filter((c) => BAR_WORDS.test(c.name) === (station === "BARRA")).map((c) => c.id);
}
