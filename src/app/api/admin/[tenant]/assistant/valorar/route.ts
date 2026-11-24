import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { rateLimit } from "@/app/lib/rateLimit";
import { rateQuestion } from "@/app/lib/assistantMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/[tenant]/assistant/valorar  { questionId, helpful } → { ok }
// 👍/👎 de una respuesta de NORA: así aprende qué le sirve a este restaurante.
export async function POST(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return NextResponse.json({ error: "Restaurante no encontrado" }, { status: 404 });
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return denied;
  const limited = await rateLimit(req, "assistant-rate", 60, 10 * 60);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { questionId?: unknown; helpful?: unknown } | null;
  if (typeof body?.questionId !== "string" || body.questionId.length > 40 || typeof body.helpful !== "boolean") {
    return NextResponse.json({ error: "Datos no válidos." }, { status: 400 });
  }
  const ok = await rateQuestion(tenant.id, body.questionId, body.helpful);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Esa pregunta ya no existe." }, { status: 404 });
}
