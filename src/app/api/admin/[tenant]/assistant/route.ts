import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { aiConfigured, AiError } from "@/app/lib/anthropic";
import { denyUnlessTenantAdmin, getSessionFromRequest } from "@/app/lib/auth";
import { rateLimit } from "@/app/lib/rateLimit";
import { askPanel, parseHistory } from "@/app/lib/assistant";
import { learnedNotes, recordQuestion, suggestionsFor } from "@/app/lib/assistantMemory";
import { localParts, tenantTimeZone } from "@/app/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function loadTenant(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true, settings: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Restaurante no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  return denied ? { error: denied } : { tenant };
}

// GET /api/admin/[tenant]/assistant → { suggestions }: lo que más se pregunta aquí.
export async function GET(req: NextRequest) {
  const { tenant, error } = await loadTenant(req);
  if (!tenant) return error;
  return NextResponse.json({ suggestions: await suggestionsFor(tenant.id) });
}

// POST /api/admin/[tenant]/assistant  { messages: [{ role, text }] } → { reply, actions, questionId }
// NORA, «pregúntale al panel» (ver docs/ASISTENTE.md). Solo gerentes.
export async function POST(req: NextRequest) {
  const { tenant, error } = await loadTenant(req);
  if (!tenant) return error;
  const limited = await rateLimit(req, "assistant", 30, 10 * 60);
  if (limited) return limited;
  if (!aiConfigured()) return NextResponse.json({ error: "El asistente con IA no está activado todavía." }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { messages?: unknown } | null;
  const history = parseHistory(body?.messages);
  if (!history) return NextResponse.json({ error: "Escribe una pregunta." }, { status: 400 });

  const session = await getSessionFromRequest(req);
  const timeZone = tenantTimeZone(tenant.settings);
  try {
    const learned = await learnedNotes(tenant.id).catch(() => "");
    const out = await askPanel(
      { tenantId: tenant.id, tenantName: tenant.name, settings: tenant.settings, timeZone, today: localParts(new Date(), timeZone).ymd, seesTakings: !!session?.seesTakings, learned },
      history
    );
    const questionId = await recordQuestion(tenant.id, history[history.length - 1].text, out.reply);
    return NextResponse.json({ ...out, questionId });
  } catch (err) {
    if (err instanceof AiError) return NextResponse.json({ error: err.message }, { status: 502 });
    console.error("[assistant]", err instanceof Error ? err.message.slice(0, 300) : err);
    return NextResponse.json({ error: "No se ha podido responder ahora mismo. Inténtalo de nuevo." }, { status: 500 });
  }
}
