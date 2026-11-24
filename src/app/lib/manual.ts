// Manual de uso del panel: un archivo por sección en docs/manual/<slug>.md.
// Lo leen la página Ayuda y NORA (herramienta como_se_hace), así que al
// cambiar el manual cambian los dos. Formato en docs/MANUAL.md
import { readFileSync } from "node:fs";
import path from "node:path";
import { MANUAL_SECTIONS } from "@/app/admin/[tenant]/(panel)/panelLinks";
import { normalize } from "@/app/lib/assistantGuide";

export type ManualEntry = { id: string; section: string; sectionTitle: string; title: string; body: string };
export type ManualSection = { slug: string; title: string; intro: string; entries: ManualEntry[] };

const slugify = (s: string) => normalize(s).replace(/ /g, "-").slice(0, 60);

export function parseManual(slug: string, fallbackTitle: string, md: string): ManualSection {
  const lines = md.replace(/\r/g, "").split("\n");
  let title = fallbackTitle;
  const intro: string[] = [];
  const entries: ManualEntry[] = [];
  let cur: { title: string; body: string[] } | null = null;
  const push = () => {
    if (!cur) return;
    const body = cur.body.join("\n").trim();
    if (body) entries.push({ id: `${slug}-${slugify(cur.title)}`, section: slug, sectionTitle: title, title: cur.title, body });
  };
  for (const l of lines) {
    const h1 = /^#\s+(.+)/.exec(l);
    const h2 = /^##\s+(.+)/.exec(l);
    if (h1 && !cur) title = h1[1].trim();
    else if (h2) {
      push();
      cur = { title: h2[1].trim(), body: [] };
    } else if (cur) cur.body.push(l);
    else intro.push(l);
  }
  push();
  return { slug, title, intro: intro.join("\n").trim(), entries };
}

let cache: ManualSection[] | null = null;
export function loadManual(): ManualSection[] {
  if (cache && process.env.NODE_ENV === "production") return cache;
  const dir = path.join(process.cwd(), "docs", "manual");
  cache = MANUAL_SECTIONS.flatMap(([slug, t]) => {
    try {
      return [parseManual(slug, t, readFileSync(path.join(dir, `${slug}.md`), "utf8"))];
    } catch {
      return [];
    }
  });
  return cache;
}

const STOP = new Set("como donde que para una uno los las del con por puedo hago hacer quiero esta este eso esto se el la de en mi un y o a es me lo le al mis tu tus hay ver sale no si ya".split(" "));
const words = (s: string) => normalize(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w));
// Raíz corta para que «agotado» encuentre «agotar» y «impresoras» «impresora».
const stem = (w: string) => w.slice(0, 5);

// Los bloques del manual que mejor responden a la pregunta.
export function searchManual(question: string, manual: ManualSection[] = loadManual(), max = 4): ManualEntry[] {
  const q = [...new Set(words(question).map(stem))];
  if (!q.length) return [];
  const scored = manual.flatMap((s) =>
    s.entries.map((e) => {
      const t = new Set(words(e.title).map(stem));
      const sec = new Set(words(s.title).map(stem));
      const b = new Set(words(e.body).map(stem));
      let score = 0;
      for (const w of q) score += (t.has(w) ? 4 : 0) + (sec.has(w) ? 2 : 0) + (b.has(w) ? 1 : 0);
      return { e, score };
    })
  );
  const best = scored.reduce((a, x) => Math.max(a, x.score), 0);
  return scored
    .filter((x) => x.score >= 3 && x.score >= best * 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.e);
}
