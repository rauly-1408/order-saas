import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { clientIp, rateLimit } from "@/app/lib/rateLimit";

const req = (ip: string) => new NextRequest("http://localhost/api/x", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });

describe("rateLimit (memoria)", () => {
  it("lee la IP del primer x-forwarded-for", () => {
    expect(clientIp(req("1.2.3.4"))).toBe("1.2.3.4");
    expect(clientIp(new NextRequest("http://localhost/"))).toBe("unknown");
  });

  it("deja pasar hasta el límite y luego responde 429 con Retry-After", async () => {
    const name = `test-${Date.now()}`;
    expect(await rateLimit(req("9.9.9.9"), name, 2, 60)).toBeNull();
    expect(await rateLimit(req("9.9.9.9"), name, 2, 60)).toBeNull();
    const blocked = await rateLimit(req("9.9.9.9"), name, 2, 60);
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get("Retry-After"))).toBeGreaterThan(0);
    // Otra IP no se ve afectada.
    expect(await rateLimit(req("8.8.8.8"), name, 2, 60)).toBeNull();
  });
});
