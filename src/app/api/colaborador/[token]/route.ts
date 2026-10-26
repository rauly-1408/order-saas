import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/app/lib/rateLimit";
import { collaboratorDashboard } from "@/app/lib/collaboratorDashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/colaborador/[token] → lo que ve el colaborador en su app. La app lo
// pide cada pocos segundos para ver los pedidos al momento. El enlace es la
// llave: solo da acceso a su propio perfil. Ver docs/COLABORADORES.md
export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, "colaborador", 30, 60);
  if (limited) return limited;
  const token = new URL(req.url).pathname.split("/").pop() ?? "";
  const data = await collaboratorDashboard(token);
  if (!data) return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
