"use client";

import { useRef, useState } from "react";
import { speechCtor, type Recognition } from "@/app/lib/speech";
import type { VoiceLine, VoiceType } from "@/app/lib/voiceStock";
import { UNIT_LABEL, formatQty, type Ingredient } from "./types";

type Props = { ingredients: Ingredient[]; api: string; onSaved: () => Promise<void> };
type Row = VoiceLine & { key: number; qty: string; state: "idle" | "done" | "error"; error?: string };

const TYPE_LABEL: Record<VoiceType, string> = { COUNT: "Hay", RECEIPT: "Entra", WASTE: "Merma" };
const EXAMPLE = "Hay 3 kilos de tomate, entran 2 cajas de pan y se ha tirado medio kilo de lechuga";

// Inventario por voz: se dicta (o escribe) lo que hay, lo que entra o lo que se
// tira, la IA lo convierte en movimientos y el dueño los revisa antes de guardar.
export default function RecuentoVoz({ ingredients, api, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saved, setSaved] = useState(0);
  const rec = useRef<Recognition | null>(null);
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const active = ingredients.filter((i) => i.isActive !== false).sort((a, b) => a.name.localeCompare(b.name, "es"));

  function toggleMic() {
    if (listening) return rec.current?.stop();
    const Ctor = speechCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "es-ES";
    r.interimResults = false;
    r.continuous = true; // se puede dictar una lista larga con pausas
    const before = text.trim();
    r.onresult = (e) => {
      const said = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" ").trim();
      setText([before, said].filter(Boolean).join(", "));
    };
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      setError("No te he oído bien. Prueba otra vez o escríbelo.");
    };
    rec.current = r;
    setError("");
    setListening(true);
    r.start();
  }

  async function understand() {
    rec.current?.stop();
    if (!text.trim()) return setError("Dicta o escribe lo que quieres apuntar");
    setBusy(true);
    setError("");
    setSaved(0);
    const res = await fetch(`${api}/stock-voice`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) ?? {};
    setBusy(false);
    if (!res?.ok) return setError(json.error ?? "No se ha podido entender. Inténtalo de nuevo.");
    const lines = (json.lines ?? []) as VoiceLine[];
    if (!lines.length) return setError("No he encontrado productos ni cantidades. Prueba algo como: «" + EXAMPLE + "».");
    setRows(lines.map((l, k) => ({ ...l, key: k, qty: String(l.quantity).replace(".", ","), state: "idle" })));
  }

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, ...patch, state: "idle", error: undefined } : r)) ?? null);
  const pending = rows?.filter((r) => r.state !== "done") ?? [];
  const invalid = pending.some((r) => !r.ingredientId || !validQty(r));

  async function saveAll() {
    if (!rows || invalid) return;
    setSaving(true);
    let ok = 0;
    const next = [...rows];
    for (const r of next) {
      if (r.state === "done") continue;
      const res = await fetch(`${api}/stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientId: r.ingredientId, type: r.type, quantity: num(r.qty), note: "Por voz" }),
      }).catch(() => null);
      const json = res && !res.ok ? await res.json().catch(() => ({})) : {};
      Object.assign(r, res?.ok ? { state: "done" } : { state: "error", error: json.error ?? "No se pudo guardar" });
      if (res?.ok) ok++;
    }
    setRows(next);
    setSaving(false);
    setSaved((s) => s + ok);
    if (ok) await onSaved();
    if (next.every((r) => r.state === "done")) {
      setRows(null);
      setText("");
    }
  }

  function reset() {
    rec.current?.stop();
    setRows(null);
    setText("");
    setError("");
  }

  const canSpeak = open && !!speechCtor();

  return (
    <section className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left sm:px-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--p-brand)] text-white">
          <MicIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-semibold">Apuntar con la voz</span>
          <span className="block text-sm text-[var(--p-muted)]">Di lo que hay, lo que entra o lo que se tira</span>
        </span>
        <span className="shrink-0 rounded-full bg-[var(--p-bg)] px-3 py-1.5 text-xs font-semibold">{open ? "Cerrar" : "Dictar"}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--p-line)] px-4 pt-3 pb-4 sm:px-5">
          {saved > 0 && !rows && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">✓ {saved === 1 ? "Guardado 1 movimiento" : `Guardados ${saved} movimientos`}</p>}

          {!rows ? (
            <>
              <div className="flex items-start gap-2">
                {canSpeak && (
                  <button
                    type="button"
                    onClick={toggleMic}
                    disabled={busy}
                    aria-label={listening ? "Dejar de escuchar" : "Dictar con la voz"}
                    aria-pressed={listening}
                    className={`p-press flex h-14 w-14 shrink-0 items-center justify-center rounded-full disabled:opacity-50 ${listening ? "animate-pulse bg-red-600 text-white" : "bg-[var(--p-brand)] text-white"}`}
                  >
                    <MicIcon />
                  </button>
                )}
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder={listening ? "Te escucho… di los productos y toca el micro para terminar" : `Ej.: ${EXAMPLE}`}
                  className="min-w-0 flex-1 rounded-xl border border-[var(--p-line)] bg-white px-3 py-2 text-[15px] text-[var(--p-ink)]"
                />
              </div>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={understand} disabled={busy || !text.trim()} className="p-press min-h-11 rounded-full bg-[var(--p-brand)] px-5 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? "Entendiendo…" : "Revisar antes de guardar"}
                </button>
                {text && !busy && (
                  <button type="button" onClick={reset} className="min-h-11 rounded-full px-3 text-sm text-[var(--p-muted)]">
                    Borrar
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-[var(--p-muted)]">Nada se guarda hasta que lo revises.</p>
            </>
          ) : (
            <>
              <p className="mb-2 text-sm text-[var(--p-muted)]">Revisa y corrige lo que haga falta:</p>
              <ul className="space-y-2">
                {rows.map((r) => {
                  const ing = r.ingredientId ? byId.get(r.ingredientId) : undefined;
                  const q = num(r.qty);
                  return (
                    <li key={r.key} className={`rounded-xl border p-3 ${r.state === "done" ? "border-emerald-200 bg-emerald-50" : r.state === "error" || !r.ingredientId ? "border-amber-300 bg-amber-50" : "border-[var(--p-line)] bg-[var(--p-bg)]"}`}>
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 truncate text-xs text-[var(--p-muted)]">«{r.heard}»</p>
                        {r.state === "done" ? (
                          <span className="text-xs font-semibold text-emerald-700">✓ Guardado</span>
                        ) : (
                          <button type="button" onClick={() => setRows((rs) => rs?.filter((x) => x.key !== r.key) ?? null)} aria-label="Quitar esta línea" className="-mt-1 -mr-1 h-8 w-8 shrink-0 rounded-full text-lg leading-none text-[var(--p-faint)] hover:text-red-500">
                            ×
                          </button>
                        )}
                      </div>
                      <select
                        value={r.ingredientId ?? ""}
                        onChange={(e) => update(r.key, { ingredientId: e.target.value || null })}
                        disabled={r.state === "done"}
                        aria-label="Ingrediente"
                        className="mt-1 w-full rounded-lg border border-[var(--p-line)] bg-white px-3 py-2 text-sm font-semibold text-[var(--p-ink)]"
                      >
                        <option value="">Elige el ingrediente…</option>
                        {active.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <div className="flex rounded-full bg-white p-0.5 ring-1 ring-[var(--p-line)]" role="radiogroup" aria-label="Tipo de movimiento">
                          {(Object.keys(TYPE_LABEL) as VoiceType[]).map((t) => (
                            <button
                              key={t}
                              type="button"
                              role="radio"
                              aria-checked={r.type === t}
                              disabled={r.state === "done"}
                              onClick={() => update(r.key, { type: t })}
                              className={`min-h-9 rounded-full px-3 text-sm font-semibold ${r.type === t ? "bg-[var(--p-ink)] text-white" : "text-[var(--p-muted)]"}`}
                            >
                              {TYPE_LABEL[t]}
                            </button>
                          ))}
                        </div>
                        <label className="flex items-center gap-1.5 text-sm">
                          <input
                            inputMode="decimal"
                            value={r.qty}
                            disabled={r.state === "done"}
                            onChange={(e) => update(r.key, { qty: e.target.value })}
                            aria-label="Cantidad"
                            className="w-24 rounded-lg border border-[var(--p-line)] bg-white px-2 py-1.5 text-right text-sm tabular-nums text-[var(--p-ink)]"
                          />
                          <span className="text-[var(--p-muted)]">{ing ? UNIT_LABEL[ing.baseUnit] : ""}</span>
                        </label>
                        {ing && Number.isFinite(q) && (ing.baseUnit === "G" || ing.baseUnit === "ML") && q >= 1000 && <span className="text-xs text-[var(--p-muted)]">= {formatQty(q, ing.baseUnit)}</span>}
                      </div>
                      {ing && r.type === "COUNT" && ing.trackStock && Number.isFinite(q) && r.state !== "done" && (
                        <p className={`mt-1.5 text-xs ${q - ing.stockQty < 0 ? "text-red-600" : "text-[var(--p-muted)]"}`}>
                          Ahora hay {formatQty(ing.stockQty, ing.baseUnit)} · diferencia {q - ing.stockQty > 0 ? "+" : ""}
                          {formatQty(q - ing.stockQty, ing.baseUnit)}
                        </p>
                      )}
                      {!r.ingredientId && <p className="mt-1.5 text-xs font-semibold text-amber-700">No sé qué ingrediente es: elígelo o quita la línea.</p>}
                      {r.ingredientId && !validQty(r) && <p className="mt-1.5 text-xs font-semibold text-amber-700">Revisa la cantidad.</p>}
                      {r.note && r.state !== "done" && <p className="mt-1.5 text-xs text-amber-700">{r.note}</p>}
                      {r.error && <p className="mt-1.5 text-xs font-semibold text-red-600">{r.error}</p>}
                    </li>
                  );
                })}
              </ul>
              {rows.length === 0 && <p className="text-sm text-[var(--p-muted)]">Has quitado todas las líneas.</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {pending.length > 0 && (
                  <button type="button" onClick={saveAll} disabled={saving || invalid} className="p-press min-h-11 rounded-full bg-[var(--p-brand)] px-5 text-sm font-semibold text-white disabled:opacity-50">
                    {saving ? "Guardando…" : pending.length === 1 ? "Guardar 1 movimiento" : `Guardar ${pending.length} movimientos`}
                  </button>
                )}
                <button type="button" onClick={reset} disabled={saving} className="min-h-11 rounded-full px-3 text-sm text-[var(--p-muted)]">
                  {pending.length ? "Descartar" : "Dictar otra vez"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

const num = (s: string) => Number(s.replace(",", "."));
function validQty(r: Row): boolean {
  const n = num(r.qty);
  return r.qty.trim() !== "" && Number.isFinite(n) && (r.type === "COUNT" ? n >= 0 : n > 0);
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
