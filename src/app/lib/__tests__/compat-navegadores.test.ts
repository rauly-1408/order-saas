import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// La app se usa en tablets y móviles con Safari antiguo (iPad con iPadOS < 16.2),
// que no entiende color-mix(). Estas reglas evitan que vuelva a salir texto
// invisible o tarjetas sin fondo. Ver docs/USABILIDAD.md («Safari de iPad antiguos»).
const ROOT = join(__dirname, "..", "..", "..");
function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f !== "__tests__" && f !== "node_modules") files(p, out);
    } else if (/\.(tsx?|css)$/.test(f)) out.push(p);
  }
  return out;
}
const all = files(join(ROOT, "app"));
const rel = (p: string) => p.slice(ROOT.length + 1);

describe("compatibilidad con Safari antiguo", () => {
  it("no hay colores de variable con transparencia (bg-[var(--x)]/10): de reserva quedan al 100 %", () => {
    const bad: string[] = [];
    for (const f of all.filter((x) => /\.tsx?$/.test(x))) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (/-\[var\(--[\w-]+\)\]\/\d/.test(line)) bad.push(`${rel(f)}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it("todo color-mix() en el código lleva color de reserva (mixBg o compat-ok)", () => {
    const bad: string[] = [];
    for (const f of all.filter((x) => /\.tsx?$/.test(x) && !x.endsWith("cssCompat.ts"))) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (line.includes("color-mix(") && !line.includes("mixBg(") && !line.includes("compat-ok") && !/^\s*\/\//.test(line)) bad.push(`${rel(f)}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it("en el CSS, cada color-mix() va justo después de la misma propiedad con un valor de reserva", () => {
    const bad: string[] = [];
    for (const f of all.filter((x) => x.endsWith(".css"))) {
      const lines = readFileSync(f, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!line.includes("color-mix(")) return;
        const prop = line.trim().split(":")[0];
        if (!lines[i - 1]?.trim().startsWith(`${prop}:`)) bad.push(`${rel(f)}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
