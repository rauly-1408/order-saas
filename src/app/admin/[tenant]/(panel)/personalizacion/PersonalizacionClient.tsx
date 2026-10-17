"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  BRAND_FONTS,
  COLOR_KEYS,
  contrastRatio,
  fontByName,
  fontNameFromCss,
  googleFontsHref,
  isHex,
  parseOnline,
  SOCIAL_FIELDS,
  type AssetKind,
  type ColorKey,
  type OnlinePresence,
} from "@/app/lib/brand";
import { getTenantTheme, SYSTEM_DEFAULT_THEME } from "@/app/lib/tenantConfig";
import { readPanelCache, writePanelCache } from "../panelCache";
import BrandPreview from "./BrandPreview";
import ImageField from "./ImageField";

// Personalización: identidad visual de la carta (imágenes, paleta, fuentes) y
// presencia online (Google y redes). Las imágenes se guardan al subirlas; el
// resto con "Guardar cambios".

type Colors = Record<ColorKey, string>; // "" = automático / por defecto
type Form = {
  name: string;
  colors: Colors;
  headingFontName: string;
  bodyFontName: string;
  headingCase: "normal" | "uppercase";
  radius: number;
  online: OnlinePresence;
};
type Assets = Record<
  "logoUrl" | "logoMonoUrl" | "logoSquareUrl" | "faviconUrl" | "heroImageUrl",
  string | null
>;
type Loaded = { form: Form; assets: Assets; branding: Record<string, unknown> };

const COLOR_INFO: Record<
  ColorKey,
  { label: string; help: string; auto?: string }
> = {
  primaryColor: {
    label: "Acento",
    help: "Botones principales de tu tienda («Añadir», «Ver pedido», «Confirmar») y la portada.",
  },
  headingColor: {
    label: "Títulos",
    help: "Títulos de las secciones de la carta.",
    auto: "Igual que el acento",
  },
  headerColor: {
    label: "Barra superior",
    help: "Fondo de la barra con tu logo y nombre, arriba del todo.",
    auto: "Igual que las tarjetas",
  },
  backgroundColor: { label: "Fondo", help: "Fondo de toda la carta." },
  secondaryColor: {
    label: "Avisos y descuentos",
    help: "Promociones, descuentos y mensajes importantes.",
  },
  surfaceColor: {
    label: "Tarjetas",
    help: "Fondo de las tarjetas de producto.",
  },
  textPrimary: {
    label: "Texto",
    help: "Nombres de producto y textos principales.",
  },
  textSecondary: {
    label: "Texto secundario",
    help: "Descripciones y detalles.",
  },
  borderColor: { label: "Bordes", help: "Líneas de separación." },
};
const MAIN_COLORS: ColorKey[] = [
  "primaryColor",
  "headingColor",
  "headerColor",
  "backgroundColor",
];
const MORE_COLORS = COLOR_KEYS.filter((k) => !MAIN_COLORS.includes(k));

const IMAGE_FIELDS: { kind: AssetKind; key: keyof Assets }[] = [
  { kind: "FAVICON", key: "faviconUrl" },
  { kind: "LOGO", key: "logoUrl" },
  { kind: "LOGO_SQUARE", key: "logoSquareUrl" },
  { kind: "LOGO_MONO", key: "logoMonoUrl" },
  { kind: "HERO", key: "heroImageUrl" },
];

const card =
  "rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5";
const input =
  "w-full rounded-lg border border-[var(--p-line)] px-3 py-2 text-sm outline-none focus:border-[var(--p-brand)]";
const labelCls = "mb-1 block text-[13px] font-medium text-[var(--p-muted)]";

function toLoaded(name: string, branding: Record<string, unknown>): Loaded {
  const theme = getTenantTheme(branding);
  const colors = Object.fromEntries(
    COLOR_KEYS.map((k) => [
      k,
      isHex(branding[k])
        ? (branding[k] as string)
        : k === "headingColor" || k === "headerColor"
          ? ""
          : (SYSTEM_DEFAULT_THEME[k] as string),
    ]),
  ) as Colors;
  const str = (k: string) =>
    typeof branding[k] === "string" && branding[k]
      ? (branding[k] as string)
      : null;
  return {
    branding,
    form: {
      name,
      colors,
      headingFontName:
        fontByName(branding.headingFontName)?.name ??
        fontNameFromCss(theme.headingFont, "Inter"),
      bodyFontName:
        fontByName(branding.bodyFontName)?.name ??
        fontNameFromCss(theme.bodyFont, "Inter"),
      headingCase: theme.headingCase === "uppercase" ? "uppercase" : "normal",
      radius: Math.min(Math.max(parseInt(theme.borderRadius, 10) || 0, 0), 28),
      online: parseOnline(branding.online),
    },
    assets: {
      logoUrl: str("logoUrl"),
      logoMonoUrl: str("logoMonoUrl"),
      logoSquareUrl: str("logoSquareUrl"),
      faviconUrl: str("faviconUrl"),
      heroImageUrl: str("heroImageUrl"),
    },
  };
}

export default function PersonalizacionClient({ tenant }: { tenant: string }) {
  const cacheKey = `personalizacion:${tenant}`;
  const [loaded, setLoaded] = useState<Loaded | null>(
    () => readPanelCache<Loaded>(cacheKey) ?? null,
  );
  const [form, setForm] = useState<Form | null>(() => loaded?.form ?? null);
  const [assets, setAssets] = useState<Assets | null>(
    () => loaded?.assets ?? null,
  );
  const [tab, setTab] = useState<"identidad" | "online">("identidad");
  const [colorTab, setColorTab] = useState<ColorKey | "more">("primaryColor");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/${tenant}`, { cache: "no-store" })
      .then((r) =>
        r.ok
          ? r.json()
          : Promise.reject(new Error("No se pudo cargar tu marca")),
      )
      .then((data) => {
        const l = toLoaded(
          data.tenant?.name ?? "",
          (data.tenant?.branding ?? {}) as Record<string, unknown>,
        );
        writePanelCache(cacheKey, l);
        setLoaded(l);
        setForm((f) => f ?? l.form);
        setAssets((a) => a ?? l.assets);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "No se pudo cargar tu marca"),
      );
  }, [tenant, cacheKey]);

  // Carga en el panel las fuentes de Google elegidas para que la vista previa sea real.
  const fontHref = form
    ? googleFontsHref([form.headingFontName, form.bodyFontName])
    : null;
  useEffect(() => {
    if (!fontHref || document.querySelector(`link[href="${fontHref}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = fontHref;
    document.head.appendChild(link);
  }, [fontHref]);

  const theme = useMemo(() => {
    if (!form || !loaded || !assets) return null;
    const colors = Object.fromEntries(
      COLOR_KEYS.filter((k) => form.colors[k]).map((k) => [k, form.colors[k]]),
    );
    return getTenantTheme({
      ...loaded.branding,
      headingColor: null,
      headerColor: null,
      ...colors,
      ...assets,
      headingFont: fontByName(form.headingFontName)?.css,
      bodyFont: fontByName(form.bodyFontName)?.css,
      headingCase: form.headingCase,
      borderRadius: `${form.radius}px`,
    });
  }, [form, loaded, assets]);

  const dirty =
    !!form && !!loaded && JSON.stringify(form) !== JSON.stringify(loaded.form);

  async function save() {
    if (!form || !loaded) return;
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const res = await fetch(`/api/admin/${tenant}/brand`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          colors: form.colors,
          headingFontName: form.headingFontName,
          bodyFontName: form.bodyFontName,
          headingCase: form.headingCase,
          borderRadius: form.radius,
          online: form.online,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo guardar");
      const l = toLoaded(form.name, json.branding);
      writePanelCache(cacheKey, { ...l, assets: assets ?? l.assets });
      setLoaded(l);
      setForm(l.form);
      setSaved("Guardado. Tu carta ya muestra los cambios.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  const setColor = (k: ColorKey, v: string) =>
    form && setForm({ ...form, colors: { ...form.colors, [k]: v } });
  const setAsset = (k: keyof Assets, url: string | null) => {
    if (!assets || !loaded) return;
    const next = { ...assets, [k]: url };
    setAssets(next);
    writePanelCache(cacheKey, { ...loaded, assets: next });
  };

  if (!form || !assets || !theme) {
    return (
      <div className="text-[var(--p-ink)]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Personalización
        </h1>
        {error ? (
          <p className="mt-6 rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">
            {error}
          </p>
        ) : (
          <p className="py-16 text-center text-[var(--p-muted)]">Cargando…</p>
        )}
      </div>
    );
  }

  // Avisos de legibilidad (contraste WCAG).
  const warnings: string[] = [];
  if (
    contrastRatio(
      theme.headingColor ?? theme.primaryColor,
      theme.backgroundColor,
    ) < 3
  )
    warnings.push(
      "Los títulos se leen mal sobre el fondo: oscurece el color de títulos o aclara el fondo.",
    );
  if (contrastRatio(theme.textPrimary, theme.surfaceColor) < 4.5)
    warnings.push("El texto se lee mal sobre las tarjetas.");

  return (
    <div className="pb-20 text-[var(--p-ink)]">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Personalización
      </h1>
      <p className="mt-1 text-sm text-[var(--p-muted)]">
        La identidad visual de tu tienda online y cómo apareces en Google y en
        redes
      </p>

      <nav className="mt-6 mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-black/[0.05] p-1">
        {(
          [
            ["identidad", "Identidad"],
            ["online", "Presencia online"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`p-press shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-300 ${tab === k ? "bg-[var(--p-surface)] text-[var(--p-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)] hover:text-[var(--p-ink)]"}`}
          >
            {l}
          </button>
        ))}
      </nav>

      <div className="max-w-4xl">
        <div className="min-w-0 space-y-4">
          {tab === "identidad" ? (
            <>
              <section className={card}>
                <label className={labelCls} htmlFor="brand-name">
                  Nombre de la marca
                </label>
                <input
                  id="brand-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={60}
                  className={input}
                />
                <p className="mt-1 text-xs text-[var(--p-muted)]">
                  Se usa en la pestaña del navegador, en Google y en el panel. En
                  la carta solo se escribe si no has subido logotipo.
                </p>
              </section>

              {IMAGE_FIELDS.map((f) => (
                <ImageField
                  key={f.kind}
                  tenant={tenant}
                  kind={f.kind}
                  url={assets[f.key]}
                  onChange={(url) => setAsset(f.key, url)}
                />
              ))}

              <section className={card}>
                <h3 className="text-[15px] font-semibold">Paleta de colores</h3>
                <p className="mt-0.5 text-xs text-[var(--p-muted)]">
                  La vista previa se actualiza al instante. Si dejas un color en
                  automático, usamos uno que se lea bien.
                </p>
                <div className="mt-3 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-black/[0.05] p-1">
                  {[...MAIN_COLORS, "more" as const].map((k) => (
                    <button
                      key={k}
                      onClick={() => setColorTab(k)}
                      className={`p-press shrink-0 rounded-full px-3 py-1 text-sm font-medium ${colorTab === k ? "bg-[var(--p-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)]"}`}
                    >
                      {k === "more" ? "Más colores" : COLOR_INFO[k].label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="min-w-0">
                    <div className="space-y-4">
                      {(colorTab === "more" ? MORE_COLORS : [colorTab]).map(
                        (k) => (
                          <ColorRow
                            key={k}
                            k={k}
                            value={form.colors[k]}
                            onChange={(v) => setColor(k, v)}
                          />
                        ),
                      )}
                    </div>
                    {warnings.length > 0 && (
                      <ul className="mt-4 space-y-1 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {warnings.map((w) => (
                          <li key={w}>⚠️ {w}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {/* Vista previa en vivo de la carta con la marca editada */}
                  <div className="min-w-0">
                    <BrandPreview theme={theme} name={form.name} />
                    <a
                      href={`/pedir/${tenant}`}
                      target="_blank"
                      className="mt-2 inline-block text-xs font-medium text-[var(--p-brand)]"
                    >
                      Abrir la carta real ↗
                    </a>
                  </div>
                </div>
              </section>

              <section className={card}>
                <h3 className="text-[15px] font-semibold">Fuentes</h3>
                <p className="mt-0.5 text-xs text-[var(--p-muted)]">
                  Fuentes de Google para los títulos y para el texto de tu
                  carta.
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <FontSelect
                    label="Títulos"
                    value={form.headingFontName}
                    onChange={(v) => setForm({ ...form, headingFontName: v })}
                  />
                  <FontSelect
                    label="Texto"
                    value={form.bodyFontName}
                    onChange={(v) => setForm({ ...form, bodyFontName: v })}
                  />
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.headingCase === "uppercase"}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        headingCase: e.target.checked ? "uppercase" : "normal",
                      })
                    }
                    className="h-4 w-4 accent-[var(--p-brand)]"
                  />
                  Títulos en mayúsculas
                </label>
                <div className="mt-3 rounded-xl bg-black/[0.03] px-4 py-3">
                  <p className="text-[11px] text-[var(--p-muted)]">
                    Vista previa
                  </p>
                  <p
                    className="text-2xl leading-tight"
                    style={{
                      fontFamily: fontByName(form.headingFontName)?.css,
                      textTransform:
                        form.headingCase === "uppercase" ? "uppercase" : "none",
                    }}
                  >
                    Molletes tiernos y esponjosos
                  </p>
                  <p
                    className="text-sm"
                    style={{ fontFamily: fontByName(form.bodyFontName)?.css }}
                  >
                    Pan de Antequera recién hecho, jamón ibérico y tomate
                    rallado.
                  </p>
                </div>
              </section>

              <section className={card}>
                <h3 className="text-[15px] font-semibold">
                  Redondeo de las tarjetas
                </h3>
                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={28}
                    value={form.radius}
                    onChange={(e) =>
                      setForm({ ...form, radius: Number(e.target.value) })
                    }
                    className="w-full accent-[var(--p-brand)]"
                    aria-label="Redondeo en píxeles"
                  />
                  <span className="w-12 shrink-0 text-right text-sm tabular-nums">
                    {form.radius}px
                  </span>
                </div>
              </section>
            </>
          ) : tab === "online" ? (
            <>
              <section className={card}>
                <h3 className="text-[15px] font-semibold">
                  Google y enlaces compartidos
                </h3>
                <p className="mt-0.5 text-xs text-[var(--p-muted)]">
                  Así aparece tu carta en Google y al compartir el enlace por
                  WhatsApp o redes.
                </p>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className={labelCls} htmlFor="seo-title">
                      Título ({(form.online.seoTitle ?? "").length}/70)
                    </label>
                    <input
                      id="seo-title"
                      value={form.online.seoTitle ?? ""}
                      maxLength={70}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          online: { ...form.online, seoTitle: e.target.value },
                        })
                      }
                      placeholder={`${form.name} · Pedidos online`}
                      className={input}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="seo-desc">
                      Descripción ({(form.online.seoDescription ?? "").length}
                      /160)
                    </label>
                    <textarea
                      id="seo-desc"
                      value={form.online.seoDescription ?? ""}
                      maxLength={160}
                      rows={3}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          online: {
                            ...form.online,
                            seoDescription: e.target.value,
                          },
                        })
                      }
                      placeholder={`Pide online en ${form.name}: a domicilio o para recoger.`}
                      className={input}
                    />
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-[var(--p-line)] p-3">
                  <p className="text-[11px] text-[var(--p-muted)]">
                    Vista previa en Google
                  </p>
                  <p className="truncate text-[15px] text-[#1a0dab]">
                    {form.online.seoTitle || `${form.name} · Pedidos online`}
                  </p>
                  <p className="line-clamp-2 text-xs text-[#4d5156]">
                    {form.online.seoDescription ||
                      `Pide online en ${form.name}: a domicilio o para recoger.`}
                  </p>
                </div>
              </section>
              <section className={card}>
                <h3 className="text-[15px] font-semibold">Redes y reseñas</h3>
                <p className="mt-0.5 text-xs text-[var(--p-muted)]">
                  Aparecen como botones al final de tu carta. Deja vacías las
                  que no uses.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {SOCIAL_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className={labelCls} htmlFor={`social-${f.key}`}>
                        {f.label}
                      </label>
                      <input
                        id={`social-${f.key}`}
                        value={form.online[f.key] ?? ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            online: { ...form.online, [f.key]: e.target.value },
                          })
                        }
                        placeholder={f.placeholder}
                        inputMode="url"
                        className={input}
                      />
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>

      {/* Barra de guardado fija abajo, fuera de la página (su animación de entrada
          rompería el position: fixed). */}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="p-glass fixed inset-x-0 bottom-0 z-30 border-t border-[var(--p-line)] px-4 py-3 text-[var(--p-ink)] lg:left-64 lg:px-10">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-3">
              {error && (
                <span className="mr-auto text-sm text-[var(--p-accent)]">
                  {error}
                </span>
              )}
              {!error && saved && !dirty && (
                <span className="mr-auto text-sm text-emerald-700">
                  {saved}
                </span>
              )}
              {!error && dirty && (
                <span className="mr-auto text-sm text-[var(--p-muted)]">
                  Tienes cambios sin guardar
                </span>
              )}
              <button
                onClick={save}
                disabled={saving || !dirty}
                className="p-press rounded-full bg-[var(--p-brand)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>,
          // Dentro del contenedor del panel (no animado) para heredar los colores --p-*.
          document.querySelector("div.panel") ?? document.body,
        )}
    </div>
  );
}

function ColorRow({
  k,
  value,
  onChange,
}: {
  k: ColorKey;
  value: string;
  onChange: (v: string) => void;
}) {
  const info = COLOR_INFO[k];
  const auto = !value && !!info.auto;
  const fallback =
    (SYSTEM_DEFAULT_THEME[k as keyof typeof SYSTEM_DEFAULT_THEME] as
      string | null) ?? "#888888";
  // Lo que se escribe a mano solo se aplica cuando es un código válido (#rrggbb).
  const [draft, setDraft] = useState({ base: value, text: value });
  const shown = draft.base === value ? draft.text : value;
  return (
    <div>
      <p className="text-sm font-medium">{info.label}</p>
      <p className="mb-2 text-xs text-[var(--p-muted)]">{info.help}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          value={value || fallback}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Color ${info.label}`}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-[var(--p-line)] bg-transparent p-0.5"
        />
        <input
          value={auto ? "" : shown}
          placeholder={auto ? info.auto : "#000000"}
          onChange={(e) => {
            const v = e.target.value.trim();
            const valid = /^#[0-9a-f]{6}$/i.test(v);
            setDraft({ base: valid ? v.toLowerCase() : value, text: v });
            if (valid) onChange(v.toLowerCase());
          }}
          className="w-32 rounded-lg px-3 py-2 font-mono text-sm outline-none"
          aria-label={`Código del color ${info.label}`}
        />
        <button
          type="button"
          onClick={() => onChange(info.auto ? "" : fallback)}
          className="p-press rounded-full px-3 py-1.5 text-xs font-medium text-[var(--p-brand)] hover:bg-black/[0.04]"
        >
          {info.auto ? "Automático" : "Restablecer"}
        </button>
      </div>
    </div>
  );
}

function FontSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const groups = ["texto", "rótulo", "elegante"] as const;
  const names = {
    texto: "Para texto",
    rótulo: "De rótulo (condensadas)",
    elegante: "Elegantes y manuscritas",
  };
  return (
    <div>
      <label className={labelCls} htmlFor={`font-${label}`}>
        {label}
      </label>
      <select
        id={`font-${label}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={input}
      >
        {groups.map((g) => (
          <optgroup key={g} label={names[g]}>
            {BRAND_FONTS.filter((f) => f.kind === g).map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
