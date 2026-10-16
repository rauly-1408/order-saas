import { NextRequest, NextResponse } from "next/server";
import { buildReport } from "@/app/lib/reports";
import { loadReportOrders, reportContext } from "@/app/lib/reportsApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/[tenant]/reports?from=AAAA-MM-DD&to=AAAA-MM-DD
export async function GET(req: NextRequest) {
  const ctx = await reportContext(req);
  if ("error" in ctx) return ctx.error;
  const { range } = ctx;
  const all = await loadReportOrders(ctx.tenant.id, range.prevStart, range.end);
  const current = all.filter((o) => o.createdAt >= range.start);
  const previous = all.filter((o) => o.createdAt < range.start);
  return NextResponse.json({ report: buildReport(current, previous, range, range.timeZone) });
}
