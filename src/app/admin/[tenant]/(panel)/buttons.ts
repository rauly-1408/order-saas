// Botones del panel: los mismos en todas las pantallas. Ver docs/USABILIDAD.md
//   primary   acción principal (Guardar, Añadir cierre)
//   secondary acción normal (Cancelar, Editar, Quitar)
//   add       «+ Añadir algo» dentro de una tarjeta o lista
//   back      «‹ Volver» arriba de la pantalla
//   link      enlace dentro de un texto (sin forma de botón)
const base = "p-press inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-50";
export const BTN = {
  primary: `${base} bg-[var(--p-brand)] px-5 text-white`,
  secondary: `${base} bg-black/[0.05] text-[var(--p-ink)]`,
  add: `${base} bg-[var(--p-brand-soft)] text-[var(--p-brand-strong)]`,
  // Como la pestaña activa del menú: fondo de la marca y texto blanco, bien visible.
  back: "p-press inline-flex min-h-11 items-center gap-1 rounded-full bg-[var(--p-brand)] px-4 text-sm font-semibold text-white shadow-sm",
  link: "p-link font-semibold underline underline-offset-2 disabled:opacity-50",
} as const;
