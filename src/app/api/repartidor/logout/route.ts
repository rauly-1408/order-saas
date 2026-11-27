import { NextResponse } from "next/server";
import { clearRiderCookie } from "@/app/lib/riderSession";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearRiderCookie());
  return response;
}
