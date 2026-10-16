// Cliente de Claude compartido (redacción de campañas, lectura de albaranes…).
import Anthropic from "@anthropic-ai/sdk";

// La clave se limpia de espacios, saltos de línea y comillas por si se colaron
// al pegarla en el panel de Vercel.
function apiKey(): string {
  return (process.env.ANTHROPIC_API_KEY ?? "").replace(/\s+/g, "").replace(/^"|"$/g, "");
}

export function aiConfigured(): boolean {
  return apiKey().length > 0;
}

export function claudeClient(): Anthropic {
  return new Anthropic({ apiKey: apiKey() });
}

export class AiError extends Error {}

// Traduce un error del SDK a un mensaje para el usuario y deja el motivo real en los logs.
export function toAiError(err: unknown, where: string): AiError | unknown {
  console.error(`[${where}] error de la API de Claude`, {
    type: err instanceof Error ? err.constructor.name : typeof err,
    status: err instanceof Anthropic.APIError ? err.status : undefined,
    requestId: err instanceof Anthropic.APIError ? err.requestID : undefined,
    message: err instanceof Error ? err.message.slice(0, 300) : String(err),
  });
  if (err instanceof Anthropic.RateLimitError) return new AiError("La IA está muy solicitada ahora mismo. Prueba en un minuto.");
  if (err instanceof Anthropic.AuthenticationError) return new AiError("La clave de la IA no es válida. Revisa ANTHROPIC_API_KEY.");
  if (err instanceof Anthropic.APIError) return new AiError("La IA no está disponible ahora mismo. Inténtalo de nuevo.");
  return err;
}
