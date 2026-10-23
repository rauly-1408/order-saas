"use client";

import { useState } from "react";
import { couponLabel, MESSAGE_TEMPLATES, renderMessage, SEGMENT_LABEL, SEGMENTS, suggestCode, type Segment } from "@/app/lib/retention";
import { card, euros, ghostBtn, input, label, primaryBtn, SEGMENT_STYLE, type CampaignRow, type CouponRow, type Overview } from "./types";
import { createCoupon, EMPTY_COUPON } from "./Cupones";
import CampanaDetalle from "./CampanaDetalle";

// Mensaje sin cupón (solo recordatorio / agradecimiento).
const NO_COUPON_TEMPLATES: Record<Segment, string> = {
  NEW: "¡Hola {nombre}! Gracias por tu primer pedido en {restaurante}. Esperamos verte pronto: {enlace}",
  REGULAR: "¡Hola {nombre}! Gracias por seguir pidiendo en {restaurante}. Esta semana tenemos novedades en la carta: {enlace}",
  VIP: "¡Hola {nombre}! Gracias por ser de nuestros mejores clientes. Te esperamos en {restaurante}: {enlace}",
  AT_RISK: "¡Hola {nombre}! Hace tiempo que no te vemos por {restaurante} y te echamos de menos. Mira lo nuevo de la carta: {enlace}",
};

const DEFAULT_NAME: Record<Segment, string> = {
  NEW: "Segundo pedido",
  REGULAR: "Gracias a los habituales",
  VIP: "Detalle para VIP",
  AT_RISK: "Recuperar clientes",
};

const STATUS: Record<CampaignRow["status"], { text: string; cls: string }> = {
  DRAFT: { text: "Borrador", cls: "bg-black/[0.04] text-[var(--p-muted)]" },
  SCHEDULED: { text: "Programada", cls: "bg-sky-50 text-sky-700" },
  SENDING: { text: "Enviando", cls: "bg-amber-50 text-amber-700" },
  SENT: { text: "Enviada", cls: "bg-emerald-50 text-emerald-700" },
  CANCELLED: { text: "Anulada", cls: "bg-black/[0.04] text-[var(--p-faint)]" },
};

type CouponChoice = "new" | "none" | string; // string = id de un cupón existente

type Form = { segment: Segment; name: string; message: string; coupon: CouponChoice; newValue: string; newCode: string };

// Si ya existe un cupón activo con el código sugerido, se reutiliza en vez de duplicarlo.
function formFor(segment: Segment, coupons: CouponRow[]): Form {
  const code = suggestCode(segment, 15);
  const existing = coupons.find((c) => c.active && c.code === code);
  return { segment, name: DEFAULT_NAME[segment], message: MESSAGE_TEMPLATES[segment], coupon: existing?.id ?? "new", newValue: "15", newCode: code };
}

export default function Campanas({
  data,
  api,
  onSaved,
  onGoToCoupons,
}: {
  data: Overview;
  api: string;
  onSaved: () => Promise<void>;
  onGoToCoupons: () => void;
}) {
  const [form, setForm] = useState<Form | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Redacción con IA
  const [idea, setIdea] = useState("");
  const [variants, setVariants] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const activeCoupons = data.coupons.filter((c) => c.active);
  const reachable = (s: Segment) => data.segments.find((x) => x.segment === s)?.reachable ?? 0;

  if (openId) {
    return (
      <CampanaDetalle
        api={api}
        id={openId}
        onBack={async () => {
          setOpenId(null);
          await onSaved();
        }}
      />
    );
  }

  function pickSegment(segment: Segment) {
    if (!form) return;
    setVariants([]); // las versiones de IA eran para el grupo anterior
    const next = formFor(segment, data.coupons);
    setForm(form.coupon === "none" ? { ...next, coupon: "none", message: NO_COUPON_TEMPLATES[segment] } : next);
  }

  function pickCoupon(coupon: CouponChoice) {
    if (!form) return;
    const wasNone = form.coupon === "none";
    const message =
      coupon === "none" ? NO_COUPON_TEMPLATES[form.segment] : wasNone ? MESSAGE_TEMPLATES[form.segment] : form.message;
    setForm({ ...form, coupon, message });
  }

  // Cupón que se usará en la vista previa
  const previewCoupon = (() => {
    if (!form || form.coupon === "none") return null;
    if (form.coupon === "new") {
      const value = Number(form.newValue);
      return value > 0 ? { code: form.newCode || "CODIGO", label: couponLabel({ type: "PERCENT", value }) } : null;
    }
    const c = data.coupons.find((x) => x.id === form.coupon);
    return c ? { code: c.code, label: couponLabel(c) } : null;
  })();

  const sampleName = data.customers.find((c) => form && c.segment === form.segment && c.marketingConsent)?.name ?? "Lucía";

  async function draftWithAi() {
    if (!form) return;
    setAiLoading(true);
    setAiError("");
    try {
      const res = await fetch(`${api}/ai-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment: form.segment, coupon: previewCoupon, idea }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo redactar el mensaje");
      setVariants(json.variants as string[]);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "No se pudo redactar el mensaje");
    } finally {
      setAiLoading(false);
    }
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      let couponId: string | null = null;
      if (form.coupon === "new") {
        couponId = await createCoupon(api, { ...EMPTY_COUPON, code: form.newCode, type: "PERCENT", value: form.newValue });
      } else if (form.coupon !== "none") {
        couponId = form.coupon;
      }
      const res = await fetch(`${api}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, targetSegment: form.segment, messageBody: form.message, couponId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // El cupón nuevo ya existe: se deja elegido para no crearlo dos veces.
        if (couponId && form.coupon === "new") setForm({ ...form, coupon: couponId });
        await onSaved();
        throw new Error(json.error ?? "No se pudo crear la campaña");
      }
      setForm(null);
      await onSaved();
      setOpenId(json.campaign.id as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la campaña");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {!form && (
        <button onClick={() => { setError(""); setForm(formFor("AT_RISK", data.coupons)); }} className={primaryBtn}>
          + Nueva campaña
        </button>
      )}

      {form && (
        <div className={`${card} p-4 sm:p-6`}>
          <h3 className="mb-4 text-[17px] font-semibold">Nueva campaña por WhatsApp</h3>

          <p className={label}>¿A quién va dirigida?</p>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {SEGMENTS.map((s) => {
              const active = form.segment === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => pickSegment(s)}
                  className={`p-press rounded-xl px-3 py-2.5 text-left text-sm ${active ? "bg-[var(--p-brand)] text-white" : "bg-black/[0.04]"}`}
                >
                  <span className="block font-medium">{SEGMENT_LABEL[s]}</span>
                  <span className={`text-xs ${active ? "text-white/80" : "text-[var(--p-muted)]"}`}>{reachable(s)} con permiso</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Nombre (solo lo ves tú)</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
            </div>
            <div>
              <label className={label}>Cupón</label>
              <select value={form.coupon} onChange={(e) => pickCoupon(e.target.value)} className={input}>
                <option value="new">Crear uno nuevo</option>
                {activeCoupons.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {couponLabel(c)}
                  </option>
                ))}
                <option value="none">Sin cupón</option>
              </select>
            </div>
          </div>

          {form.coupon === "new" && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label}>Descuento (%)</label>
                <input
                  value={form.newValue}
                  inputMode="numeric"
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    setForm({ ...form, newValue: v, newCode: suggestCode(form.segment, Number(v) || 0) });
                  }}
                  className={input}
                />
              </div>
              <div>
                <label className={label}>Código</label>
                <input value={form.newCode} onChange={(e) => setForm({ ...form, newCode: e.target.value.toUpperCase().replace(/\s/g, "") })} className={input} />
              </div>
              <p className="text-xs text-[var(--p-muted)] sm:col-span-2">
                Un uso por cliente y sin caducidad. Para más opciones,{" "}
                <button type="button" onClick={onGoToCoupons} className="font-medium text-[var(--p-brand)] hover:underline">
                  créalo en Cupones
                </button>
                .
              </p>
            </div>
          )}

          {/* Redactar con IA: 3 versiones a partir del grupo, el cupón y los platos más pedidos */}
          <div className="mt-4 rounded-2xl bg-[var(--p-brand-soft)] p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                maxLength={200}
                placeholder="Idea opcional: «estrenamos tarta de queso con turrón»"
                className={`${input} min-w-0 flex-1`}
                disabled={!data.aiEnabled}
              />
              <button type="button" onClick={draftWithAi} disabled={!data.aiEnabled || aiLoading} className={`${primaryBtn} shrink-0`}>
                {aiLoading ? "Redactando…" : variants.length ? "✨ Otras versiones" : "✨ Redactar con IA"}
              </button>
            </div>
            {!data.aiEnabled && <p className="mt-2 text-xs text-[var(--p-muted)]">La redacción con IA se activará en cuanto esté configurada.</p>}
            {aiError && <p className="mt-2 text-xs text-[var(--p-accent)]">{aiError}</p>}
            {variants.length > 0 && (
              <ul className="mt-3 space-y-2">
                {variants.map((v, i) => {
                  const chosen = form.message === v;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, message: v })}
                        className={`p-press w-full rounded-xl px-3 py-2.5 text-left text-sm ${
                          chosen ? "bg-[var(--p-brand)] text-white" : "bg-[var(--p-surface)] hover:shadow-sm"
                        }`}
                      >
                        <span className={`mb-0.5 block text-[11px] font-semibold ${chosen ? "text-white/80" : "text-[var(--p-muted)]"}`}>
                          {chosen ? "✓ Usando esta versión" : `Versión ${i + 1} · tócala para usarla`}
                        </span>
                        {v}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <label className={label}>Mensaje</label>
            <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4} className={input} />
            <p className="mt-1 text-xs text-[var(--p-muted)]">
              Se rellenan solos: {"{nombre}"}, {"{restaurante}"}, {"{enlace}"}
              {form.coupon !== "none" && <>, {"{cupon}"}, {"{descuento}"}</>}. El texto para darse de baja se añade siempre.
            </p>
          </div>

          {/* Vista previa como burbuja de WhatsApp */}
          <div className="mt-4 rounded-2xl bg-[#e7ddd3] p-4">
            <p className="mb-2 text-xs font-medium text-black/50">Así lo verá {sampleName.split(" ")[0]}</p>
            <div className="ml-auto max-w-[85%] whitespace-pre-line rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-sm text-[#111b21] shadow-sm">
              {renderMessage(form.message, {
                nombre: sampleName,
                restaurante: data.restaurant,
                enlace: `${typeof window !== "undefined" ? window.location.origin : ""}/pedir/…`,
                cupon: previewCoupon?.code,
                descuento: previewCoupon?.label,
              })}
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-[var(--p-accent)]">{error}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button onClick={save} disabled={saving || reachable(form.segment) === 0} className={primaryBtn}>
              {saving ? "Preparando…" : `Preparar ${reachable(form.segment)} mensajes`}
            </button>
            <button onClick={() => setForm(null)} className={ghostBtn}>
              Cancelar
            </button>
            {reachable(form.segment) === 0 && <span className="text-xs text-[var(--p-muted)]">Nadie de este grupo ha aceptado recibir ofertas todavía.</span>}
          </div>
        </div>
      )}

      {data.campaigns.length === 0 ? (
        !form && (
          <div className={`${card} p-10 text-center`}>
            <p className="font-semibold">Aún no has enviado ninguna campaña</p>
            <p className="mt-1 text-sm text-[var(--p-muted)]">Empieza por los clientes en riesgo: son los que más fácil vuelven con un buen mensaje.</p>
          </div>
        )
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.campaigns.map((c, i) => {
            const st = STATUS[c.status];
            const pct = c.recipients ? Math.round((c.sent / c.recipients) * 100) : 0;
            return (
              <li key={c.id} className="p-rise" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
                <button onClick={() => setOpenId(c.id)} className={`${card} p-lift p-press block w-full p-5 text-left`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.name}</p>
                      <p className="text-xs text-[var(--p-muted)]">
                        <span className={`mr-1 inline-block rounded-full px-2 py-0.5 ${SEGMENT_STYLE[c.targetSegment]}`}>{SEGMENT_LABEL[c.targetSegment]}</span>
                        {c.couponCode ? `Cupón ${c.couponCode}` : "Sin cupón"} · {new Date(c.createdAt).toLocaleDateString("es-ES")}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.text}</span>
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                    <div className="h-full rounded-full bg-[var(--p-brand)] transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <Metric value={`${c.sent}/${c.recipients}`} label="Enviados" />
                    <Metric value={String(c.converted)} label="Volvieron" />
                    {c.revenueCents != null && <Metric value={euros(c.revenueCents)} label="Facturado" />}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Metric({ value, label: text }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-[17px] font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-[var(--p-muted)]">{text}</p>
    </div>
  );
}
