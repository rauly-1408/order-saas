// Aplica las migraciones de Prisma durante el build de Vercel, solo en el
// entorno de producción. Así el código nuevo nunca se publica sin sus columnas
// (el 23-10-2026 el seguimiento y el panel dieron error 500 hasta que se
// ejecutó la migración a mano). Ver docs/OPERACIONES.md §9
//
// - En Vercel «preview» (ramas y PR) no se toca la base: una rama no debe
//   cambiar la base de producción antes de fusionarse.
// - En local (sin VERCEL_ENV) tampoco: `npm run build` no migra nada; la
//   migración local sigue siendo `npx prisma migrate deploy` a mano.
import { spawnSync } from "node:child_process";

const env = process.env.VERCEL_ENV;
if (env !== "production") {
  console.log(`[migraciones] entorno «${env ?? "local"}»: no se aplican migraciones en el build.`);
  process.exit(0);
}
if (!process.env.DIRECT_URL) {
  console.error("[migraciones] Falta DIRECT_URL en Vercel (la conexión directa de Neon, sin «-pooler»). Añádela en Settings → Environment Variables y vuelve a desplegar.");
  process.exit(1);
}
console.log("[migraciones] producción: aplicando migraciones pendientes antes de compilar…");
const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: process.env });
process.exit(r.status ?? 1);
