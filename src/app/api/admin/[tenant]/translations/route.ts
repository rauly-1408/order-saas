import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { aiConfigured, AiError } from "@/app/lib/anthropic";
import { collectMenuTexts, saveTranslations, translateWithAi } from "@/app/lib/menuTranslate";
import { enabledLangs } from "@/app/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, settings: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  return { tenant };
}

// GET → textos de la carta con su traducción, si el inglés está activo y si hay IA.
export async function GET(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const texts = await collectMenuTexts(c.tenant.id);
  return NextResponse.json({ texts, english: enabledLangs(c.tenant.settings).includes("en"), aiEnabled: aiConfigured() });
}

// POST { mode: "missing" | "all" } → traduce con IA y activa el inglés.
export async function POST(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  if (!aiConfigured()) return NextResponse.json({ error: "La IA no está configurada" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { mode?: string };
  const texts = await collectMenuTexts(c.tenant.id);
  const todo = body.mode === "all" ? texts : texts.filter((t) => !t.en);
  if (!todo.length) return NextResponse.json({ translated: 0 });
  try {
    const result = await translateWithAi(todo);
    const saved = await saveTranslations(
      c.tenant.id,
      todo.filter((t) => result.has(`${t.ref}|${t.field}`)).map((t) => ({ ref: t.ref, field: t.field, en: result.get(`${t.ref}|${t.field}`)! }))
    );
    const settings = { ...((c.tenant.settings as Record<string, unknown>) ?? {}), languages: ["es", "en"] };
    await prisma.tenant.update({ where: { id: c.tenant.id }, data: { settings } });
    return NextResponse.json({ translated: saved });
  } catch (err) {
    if (err instanceof AiError) return NextResponse.json({ error: err.message }, { status: 502 });
    console.error("[translations POST]", err);
    return NextResponse.json({ error: "No se pudo traducir la carta" }, { status: 500 });
  }
}

// PUT { items?: [{ ref, field, en }], english?: boolean } → guarda correcciones y/o activa el inglés.
export async function PUT(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const body = (await req.json().catch(() => null)) as { items?: unknown; english?: unknown } | null;
  const items = Array.isArray(body?.items)
    ? body!.items
        .map((i) => (i ?? {}) as Record<string, unknown>)
        .filter((i) => typeof i.ref === "string" && typeof i.field === "string")
        .slice(0, 2000)
        .map((i) => ({ ref: i.ref as string, field: i.field as string, en: typeof i.en === "string" ? i.en : null }))
    : [];
  const saved = items.length ? await saveTranslations(c.tenant.id, items) : 0;
  if (typeof body?.english === "boolean") {
    const settings = { ...((c.tenant.settings as Record<string, unknown>) ?? {}), languages: body.english ? ["es", "en"] : ["es"] };
    await prisma.tenant.update({ where: { id: c.tenant.id }, data: { settings } });
  }
  return NextResponse.json({ saved });
}
