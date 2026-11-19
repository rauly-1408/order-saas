import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildZip, crc32, uniqueNames } from "../zip";

describe("zip", () => {
  it("crc32 conocido", () => expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926));
  it("nombres sin repetir ni barras", () => expect(uniqueNames(["a.webp", "A.webp", "Sin usar/y.png", "../../etc", ""])).toEqual(["a.webp", "A (2).webp", "Sin usar/y.png", "etc", "archivo"]));
  it("el sistema lo abre y saca los archivos tal cual", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "zip-"));
    const a = new Uint8Array([1, 2, 3, 250]);
    const b = new TextEncoder().encode("Molleté ñ");
    writeFileSync(path.join(dir, "t.zip"), buildZip([{ name: "uno.bin", data: a }, { name: "dos ñ.txt", data: b }]));
    // Python lee el ZIP como cualquier programa (y respeta los nombres en UTF-8).
    const out = execFileSync("python3", ["-c", "import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(json.dumps({n:list(z.read(n)) for n in z.namelist()}))", path.join(dir, "t.zip")]).toString();
    const files = JSON.parse(out) as Record<string, number[]>;
    expect(files["uno.bin"]).toEqual([...a]);
    expect(Buffer.from(files["dos ñ.txt"]).toString("utf8")).toBe("Molleté ñ");
  });
});
