import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Envíos que se pueden repetir sin duplicar (rondas y ventas guardadas sin
// conexión). El aparato manda un `requestId`; la primera vez se atiende y se
// guarda la respuesta, y las siguientes se devuelve la misma. Ver docs/SIN-CONEXION.md

const ID = /^[A-Za-z0-9-]{16,64}$/;

export function requestIdOf(v: unknown): string | null {
  return typeof v === "string" && ID.test(v) ? v : null;
}

export async function once(tenantId: string, requestId: string | null, run: () => Promise<NextResponse>): Promise<NextResponse> {
  if (!requestId) return run();
  const key = `${tenantId}:${requestId}`;
  // De vez en cuando se borra lo de más de una semana (una cola no espera tanto).
  if (Math.random() < 0.02) await prisma.clientRequest.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } }).catch(() => {});
  try {
    await prisma.clientRequest.create({ data: { id: key, tenantId } });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    const prev = await prisma.clientRequest.findUnique({ where: { id: key }, select: { response: true } });
    if (prev?.response != null) return NextResponse.json(prev.response);
    return NextResponse.json({ error: "Este envío se está procesando. Espera un momento." }, { status: 409 });
  }
  let res: NextResponse;
  try {
    res = await run();
  } catch (err) {
    await prisma.clientRequest.delete({ where: { id: key } }).catch(() => {});
    throw err;
  }
  if (res.ok) {
    const body = await res.clone().json().catch(() => ({}));
    await prisma.clientRequest.update({ where: { id: key }, data: { response: body as Prisma.InputJsonValue } }).catch(() => {});
  } else {
    // Un error (mesa ya cobrada, producto agotado…) no se guarda: se puede corregir y reintentar.
    await prisma.clientRequest.delete({ where: { id: key } }).catch(() => {});
  }
  return res;
}
