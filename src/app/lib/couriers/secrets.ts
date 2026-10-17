// Secretos del repartidor externo (clave privada de Glovo, secreto del webhook).
import { seal, unseal } from "@/app/lib/secretBox";

const PURPOSE = "courier-secrets-v1";
export const sealSecrets = (data: Record<string, string>) => seal(data, PURPOSE);
export const openSecrets = (sealed: string | null | undefined) => unseal(sealed, PURPOSE);
