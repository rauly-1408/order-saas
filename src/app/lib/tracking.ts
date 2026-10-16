// Seguimiento del pedido por el cliente y reseñas. Funciones puras: las usan
// la página de seguimiento, su API y el panel. Ver docs/SEGUIMIENTO-Y-RESENAS.md

export type TrackChannel = "DELIVERY" | "TAKEAWAY";
export type StepState = "done" | "current" | "todo";

// Pasos que ve el cliente según el canal (sin "En reparto" si recoge).
export function trackingSteps(channel: TrackChannel, status: string): { key: string; label: string; state: StepState }[] {
  const steps =
    channel === "DELIVERY"
      ? [
          { key: "CREATED", label: "Recibido" },
          { key: "PREPARING", label: "En cocina" },
          { key: "DELIVERING", label: "En camino" },
          { key: "DELIVERED", label: "Entregado" },
        ]
      : [
          { key: "CREATED", label: "Recibido" },
          { key: "PREPARING", label: "En cocina" },
          { key: "READY", label: "Listo para recoger" },
          { key: "DELIVERED", label: "Recogido" },
        ];
  // Estados intermedios que caen en un paso de la línea.
  const map: Record<string, string> = {
    CREATED: "CREATED", PAID: "CREATED", SENT_TO_POS: "CREATED", ACCEPTED: "PREPARING", PREPARING: "PREPARING",
    READY: channel === "DELIVERY" ? "PREPARING" : "READY", DELIVERING: "DELIVERING", DELIVERED: "DELIVERED",
  };
  const current = steps.findIndex((s) => s.key === map[status]);
  return steps.map((s, i) => ({ ...s, state: status === "DELIVERED" || i < current ? "done" : i === current ? "current" : "todo" }));
}

export const FINAL_STATUSES = ["DELIVERED", "CANCELLED"];

// Mensaje del aviso al cliente cuando cambia el estado (null = no avisar).
export function statusNotice(channel: TrackChannel, status: string): string | null {
  if (status === "PREPARING") return "Tu pedido ya está en cocina";
  if (status === "READY" && channel === "TAKEAWAY") return "¡Tu pedido está listo! Ya puedes pasar a recogerlo";
  if (status === "DELIVERING") return "¡Tu pedido va de camino!";
  if (status === "CANCELLED") return "Tu pedido se ha cancelado";
  return null;
}

// Con 4 o 5 estrellas se invita a dejar la reseña también en Google.
export const GOOGLE_REVIEW_MIN = 4;

export function parseReview(body: unknown): { rating: number; comment: string | null } | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const rating = Number(b.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return "Elige de 1 a 5 estrellas";
  const comment = typeof b.comment === "string" && b.comment.trim() ? b.comment.trim().slice(0, 600) : null;
  return { rating, comment };
}
