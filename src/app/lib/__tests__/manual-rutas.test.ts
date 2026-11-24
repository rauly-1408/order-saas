import { describe, expect, it } from "vitest";
import { loadManual } from "../manual";
import { resolveRoute } from "@/app/admin/[tenant]/(panel)/panelLinks";

// Cada ruta en negrita del manual («**Carta → Productos**») debe llevar a un sitio que existe.
describe("rutas del manual", () => {
  it("todas las rutas en negrita con flecha se pueden enlazar", () => {
    const bad: string[] = [];
    for (const s of loadManual())
      for (const e of s.entries)
        for (const line of e.body.split("\n"))
          line
            .split("**")
            .filter((_, i) => i % 2 === 1 && _.includes("→"))
            .forEach((r) => !resolveRoute(r, "demo") && bad.push(`${s.slug} · ${e.title}: ${r}`));
    expect(bad).toEqual([]);
  });
});
