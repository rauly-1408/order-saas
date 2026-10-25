"use client";

import { ask } from "@/app/lib/dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CuentaView from "./CuentaView";
import SalaView from "./SalaView";
import { Sheet, Stepper, post, type Fixture, type MapData, type Shape, type Table } from "./shared";

// Mesas: el plano de la sala por zonas (Interior, Terraza, Barra…). Libre en
// blanco, ocupada en el color de la marca y «pide la cuenta» en ámbar. Tocar una
// mesa libre la abre; una ocupada, su cuenta. El gerente coloca las mesas
// arrastrándolas y las crea de golpe («1 a 11», «B1 a B3»). Ver docs/MESAS.md

const POLL_MS = 8000;
type Pos = Record<string, { x: number; y: number }>;

// Posición inicial de las mesas que aún no están en el plano: en filas.
function autoPlace(tables: Table[], taken: Pos): Pos {
  const out: Pos = {};
  const free = tables.filter((t) => !taken[t.id]);
  const cols = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(free.length * 1.5))));
  free.forEach((t, i) => {
    out[t.id] = { x: 12 + (i % cols) * (76 / Math.max(1, cols - 1)), y: 14 + Math.floor(i / cols) * 22 };
  });
  return out;
}

export default function MesasClient({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/mesas`;
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState("");
  const [storeId, setStoreId] = useState<string | null>(null);
  const [zone, setZone] = useState<string>("");
  const [view, setView] = useState<string | null>(null); // cuenta abierta (orderId)
  const [viewAction, setViewAction] = useState<"round" | "pay" | undefined>(undefined);
  const [notice, setNotice] = useState("");
  const [opening, setOpening] = useState<Table | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editTable, setEditTable] = useState<Table | null>(null);
  const planDirty = useRef(false); // el editor tiene cambios sin guardar
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${api}${storeId ? `?store=${encodeURIComponent(storeId)}` : ""}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudieron cargar las mesas");
      setData(json as MapData);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las mesas");
    }
  }, [api, storeId]);

  // Se refresca solo (otro camarero abre o cobra una mesa), salvo editando el plano.
  useEffect(() => {
    if (view) return;
    let alive = true;
    const run = () => alive && !document.hidden && load();
    run();
    if (editing) return () => void (alive = false);
    const t = setInterval(() => {
      run();
      setTick((n) => n + 1);
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [load, view, editing]);

  const zones = useMemo(() => [...new Set((data?.tables ?? []).map((t) => t.zone))], [data]);
  const currentZone = zones.includes(zone) ? zone : (zones[0] ?? "");
  const inZone = useMemo(() => (data?.tables ?? []).filter((t) => t.zone === currentZone), [data, currentZone]);
  const busyCount = (data?.tables ?? []).filter((t) => t.open).length;

  if (view)
    return (
      <CuentaView
        key={view}
        tenant={tenant}
        orderId={view}
        initialAction={viewAction}
        onBack={() => {
          setView(null);
          setViewAction(undefined);
          load();
        }}
      />
    );

  return (
    <div className="text-[var(--p-ink)]">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Mesas</h1>
        {data && data.tables.length > 0 && (
          <span className="text-sm text-[var(--p-muted)]">
            {busyCount} de {data.tables.length} ocupadas
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {data && data.stores.length > 1 && (
            <select value={data.storeId ?? ""} onChange={(e) => setStoreId(e.target.value)} aria-label="Local" className="rounded-full border border-[var(--p-line)] bg-[var(--p-surface)] px-3 py-2 text-sm">
              {data.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {data?.canManage && data.tables.length > 0 && (
            <button type="button" onClick={async () => {
                if (editing && planDirty.current && !(await ask("Hay cambios en el plano sin guardar. ¿Salir sin guardarlos?"))) return;
                planDirty.current = false;
                setEditing((v) => !v);
              }} className={`p-press rounded-full px-4 py-2 text-sm font-semibold ${editing ? "bg-[var(--p-ink)] text-white" : "bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.05)]"}`}>
              {editing ? "Terminar" : "Editar mesas"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-4 rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">{error}</p>}
      {notice && (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {notice}
        </p>
      )}

      {!data ? (
        !error && <p className="py-16 text-center text-sm text-[var(--p-muted)]">Cargando las mesas…</p>
      ) : data.tables.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--p-line)] bg-[var(--p-surface)]/60 px-6 py-12 text-center">
          <p className="text-lg font-semibold">Todavía no hay mesas</p>
          {data.canManage ? (
            <>
              <p className="mx-auto mt-1 max-w-md text-sm text-[var(--p-muted)]">Crea las mesas de cada zona (por ejemplo, Interior del 1 al 11 y Barra del B1 al B3). Después las colocas en el plano arrastrándolas.</p>
              <button type="button" onClick={() => setAdding(true)} className="p-press mt-5 rounded-full bg-[var(--p-brand)] px-5 py-2.5 text-sm font-semibold text-white">
                Crear mesas
              </button>
            </>
          ) : (
            <p className="mt-1 text-sm text-[var(--p-muted)]">Pide al gerente que cree las mesas en esta pantalla.</p>
          )}
        </div>
      ) : (
        <>
          {zones.length > 1 && (
            <nav className="mt-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-black/[0.05] p-1" aria-label="Zonas">
              {zones.map((z) => {
                const n = (data.tables ?? []).filter((t) => t.zone === z && t.open).length;
                return (
                  <button key={z} type="button" onClick={async () => {
                    if (editing && planDirty.current && !(await ask("Hay cambios en el plano sin guardar. ¿Cambiar de zona sin guardarlos?", { confirm: "Cambiar sin guardar", danger: true }))) return;
                    planDirty.current = false;
                    setZone(z);
                  }} aria-pressed={z === currentZone} className={`p-press shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${z === currentZone ? "bg-[var(--p-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)]"}`}>
                    {z}
                    {n > 0 && <span className="ml-1.5 text-xs text-[var(--p-brand)]">{n}</span>}
                  </button>
                );
              })}
            </nav>
          )}

          {editing ? (
            <PlanEditor
              key={`${data.storeId}:${currentZone}`}
              tables={inZone}
              fixtures={data.fixtures?.[currentZone] ?? []}
              zone={currentZone}
              storeId={data.storeId}
              onDirty={(d) => (planDirty.current = d)}
              onSaved={load}
              onTapTable={setEditTable}
              onAdd={() => setAdding(true)}
              api={api}
            />
          ) : (
            <SalaView
              tables={inZone}
              allTables={data.tables}
              fixtures={data.fixtures?.[currentZone] ?? []}
              sees={data.sees}
              now={Date.now()}
              onOpenFree={setOpening}
              onAction={async (t, a) => {
                if (!t.open) return;
                if (a === "bill") {
                  try {
                    const r = await post<{ printed: number }>(`${api}/${t.open.orderId}`, { action: "bill" });
                    setNotice(r.printed > 0 ? `Cuenta de la mesa ${t.name} enviada a la impresora` : `Mesa ${t.name} marcada «pide la cuenta» (no hay impresora de tickets)`);
                  } catch (e) {
                    setNotice(e instanceof Error ? e.message : "No se pudo imprimir la cuenta");
                  }
                  setTimeout(() => setNotice(""), 4000);
                  load();
                  return;
                }
                setViewAction(a === "view" ? undefined : a);
                setView(t.open.orderId);
              }}
            />
          )}
        </>
      )}

      {opening && (
        <OpenSheet
          table={opening}
          onClose={() => setOpening(null)}
          onOpen={async (guests) => {
            const r = await post<{ orderId: string }>(api, { action: "open", tableId: opening.id, guests });
            setOpening(null);
            setViewAction("round"); // directo a tomar nota
            setView(r.orderId);
          }}
        />
      )}
      {adding && data && (
        <AddSheet
          zones={zones}
          defaultZone={currentZone || "Interior"}
          onClose={() => setAdding(false)}
          onAdd={async (body) => {
            const r = await post<{ created: number; skipped: number }>(api, { action: "add", storeId: data.storeId, ...body });
            setAdding(false);
            setZone(body.zone);
            await load();
            return r;
          }}
        />
      )}
      {editTable && (
        <EditSheet
          table={editTable}
          zones={zones}
          onClose={() => setEditTable(null)}
          onSave={async (body) => {
            await post(api, { action: "update", tableId: editTable.id, ...body });
            setEditTable(null);
            await load();
          }}
          onRemove={async () => {
            await post(api, { action: "remove", tableId: editTable.id });
            setEditTable(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

const TILE = "aspect-square w-[8%] min-w-[44px] max-w-[96px]";
// Barra alta y estrecha: el texto en vertical para que quepa.
const isTall = (f: Fixture) => f.h * 3 > f.w * 4 * 1.5;

const FIXTURE_NEW: Record<Fixture["kind"], Omit<Fixture, "id">> = {
  BAR: { kind: "BAR", x: 30, y: 70, w: 35, h: 8, label: "Barra" },
  WALL: { kind: "WALL", x: 5, y: 50, w: 30, h: 1.5, label: "" },
  LABEL: { kind: "LABEL", x: 40, y: 90, w: 20, h: 6, label: "Entrada" },
};

type Drag = { kind: "table" | "move" | "resize"; id: string; startX: number; startY: number; moved: boolean; orig?: Fixture };

// Editar el plano: arrastrar mesas y elementos para colocarlos; la esquina de
// un elemento lo estira; tocar sin arrastrar abre su ficha.
function PlanEditor({ tables, fixtures, zone, storeId, api, onSaved, onTapTable, onAdd, onDirty }: { tables: Table[]; fixtures: Fixture[]; zone: string; storeId: string | null; api: string; onSaved: () => Promise<void>; onTapTable: (t: Table) => void; onAdd: () => void; onDirty: (dirty: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  // Lo guardado y lo arrastrado; las mesas sin sitio (también las recién creadas) se colocan solas.
  const [pos, setPos] = useState<Pos>(() => {
    const p: Pos = {};
    for (const t of tables) if (t.posX != null && t.posY != null) p[t.id] = { x: t.posX, y: t.posY };
    return p;
  });
  const shown = useMemo(() => ({ ...autoPlace(tables, pos), ...pos }), [tables, pos]);
  const [fx, setFx] = useState<Fixture[]>(fixtures);
  const [moved, setMoved] = useState(false);
  const dirty = moved || tables.some((t) => !pos[t.id]);
  // Con llaves: un efecto solo puede devolver una función (en producción, otra cosa rompe la página).
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [editFx, setEditFx] = useState<Fixture | null>(null);
  const drag = useRef<Drag | null>(null);

  function addFixture(kind: Fixture["kind"]) {
    const f = { ...FIXTURE_NEW[kind], id: `f${Date.now()}` };
    setFx((l) => [...l, f]);
    setMoved(true);
    if (kind !== "WALL") setEditFx(f);
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    const rect = box.current?.getBoundingClientRect();
    if (!d || !rect) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
    d.moved = true;
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    if (d.kind === "table") {
      setPos((p) => ({ ...p, [d.id]: { x: Math.max(3, Math.min(97, px)), y: Math.max(3, Math.min(97, py)) } }));
    } else if (d.orig) {
      const o = d.orig;
      const dx = ((e.clientX - d.startX) / rect.width) * 100;
      const dy = ((e.clientY - d.startY) / rect.height) * 100;
      setFx((l) =>
        l.map((f) =>
          f.id !== d.id
            ? f
            : d.kind === "move"
              ? { ...f, x: Math.max(0, Math.min(100 - f.w, o.x + dx)), y: Math.max(0, Math.min(100 - f.h, o.y + dy)) }
              : { ...f, w: Math.max(1, Math.min(100 - f.x, o.w + dx)), h: Math.max(1, Math.min(100 - f.y, o.h + dy)) }
        )
      );
    }
    setMoved(true);
  }

  function end() {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    if (d.kind === "table") {
      const t = tables.find((x) => x.id === d.id);
      if (t) onTapTable(t);
    } else {
      const f = fx.find((x) => x.id === d.id);
      if (f) setEditFx(f);
    }
  }

  const start = (kind: Drag["kind"], id: string, e: React.PointerEvent, orig?: Fixture) => {
    e.stopPropagation();
    box.current?.setPointerCapture?.(e.pointerId);
    drag.current = { kind, id, startX: e.clientX, startY: e.clientY, moved: false, orig };
  };

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      await post(api, { action: "layout", positions: Object.entries(shown).filter(([id]) => tables.some((t) => t.id === id)).map(([id, v]) => ({ id, posX: v.x, posY: v.y })) });
      await post(api, { action: "fixtures", storeId, zone, items: fx });
      setPos(shown);
      setMoved(false);
      setMsg("Plano guardado");
      await onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo guardar el plano");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4">
      <p className="mb-3 text-sm text-[var(--p-muted)]">Arrastra mesas y elementos a su sitio. La esquina de la barra o la pared la estira. Toca algo para cambiarlo o quitarlo.</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onAdd} className="p-press rounded-full bg-[var(--p-surface)] px-4 py-2 text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          + Mesas
        </button>
        <button type="button" onClick={() => addFixture("BAR")} className="p-press rounded-full bg-[var(--p-surface)] px-4 py-2 text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          + Barra
        </button>
        <button type="button" onClick={() => addFixture("WALL")} className="p-press rounded-full bg-[var(--p-surface)] px-4 py-2 text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          + Pared
        </button>
        <button type="button" onClick={() => addFixture("LABEL")} className="p-press rounded-full bg-[var(--p-surface)] px-4 py-2 text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          + Texto
        </button>
        <button type="button" onClick={save} disabled={!dirty || saving} className="p-press ml-auto rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Guardando…" : "Guardar plano"}
        </button>
      </div>
      {msg && <p className="mb-2 text-sm text-[var(--p-muted)]" role="status">{msg}</p>}
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div
        ref={box}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={() => (drag.current = null)}
        className="relative mx-auto aspect-[4/3] w-full min-w-[600px] overflow-hidden rounded-3xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] [background-image:radial-gradient(rgba(0,0,0,0.08)_1px,transparent_1px)] [background-size:24px_24px] lg:max-w-[calc((100vh-19rem)*4/3)]"
      >
        {fx.map((f) => (
          <div
            key={f.id}
            role="button"
            tabIndex={0}
            aria-label={`${f.kind === "BAR" ? "Barra" : f.kind === "WALL" ? "Pared" : "Texto"}${f.label ? ` «${f.label}»` : ""}: arrastra para moverla o toca para editarla`}
            onPointerDown={(e) => start("move", f.id, e, f)}
            onKeyDown={(e) => e.key === "Enter" && setEditFx(f)}
            style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%` }}
            className={`absolute flex cursor-grab touch-none select-none items-center justify-center text-center text-[10px] font-semibold uppercase tracking-wide ring-2 ring-[var(--p-brand)]/40 sm:text-sm ${f.kind === "BAR" ? "rounded-md bg-[var(--p-brand)]/75 text-white" : f.kind === "WALL" ? "rounded-sm bg-neutral-600" : "rounded-md bg-black/[0.03] text-[var(--p-muted)]"}`}
          >
            {f.kind !== "WALL" && <span className={f.kind === "BAR" && isTall(f) ? "[writing-mode:vertical-rl]" : ""}>{f.label}</span>}
            {f.kind !== "LABEL" && (
              <span
                aria-hidden
                onPointerDown={(e) => start("resize", f.id, e, f)}
                className="absolute -bottom-2 -right-2 z-20 h-5 w-5 cursor-se-resize touch-none rounded-full border-2 border-white bg-[var(--p-ink)] shadow"
              />
            )}
          </div>
        ))}
        {tables.map((t) => {
          const p = shown[t.id];
          if (!p) return null;
          return (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              aria-label={`Mesa ${t.name}: arrastra para moverla o toca para editarla`}
              onPointerDown={(e) => start("table", t.id, e)}
              onKeyDown={(e) => e.key === "Enter" && onTapTable(t)}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              className={`absolute flex ${TILE} -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none flex-col items-center justify-center bg-white text-center shadow-[0_2px_8px_rgba(0,0,0,0.18)] ring-2 ring-[var(--p-brand)] active:cursor-grabbing ${t.shape === "ROUND" ? "rounded-full" : "rounded-xl"}`}
            >
              <span className="text-sm font-semibold leading-none sm:text-base">{t.name}</span>
              <span className="mt-0.5 hidden text-[10px] text-[var(--p-muted)] sm:block">{t.seats} pax</span>
            </div>
          );
        })}
      </div>
      </div>
      {editFx && (
        <FixtureSheet
          f={editFx}
          onClose={() => setEditFx(null)}
          onSave={(label) => {
            setFx((l) => l.map((x) => (x.id === editFx.id ? { ...x, label } : x)));
            setMoved(true);
            setEditFx(null);
          }}
          onRemove={() => {
            setFx((l) => l.filter((x) => x.id !== editFx.id));
            setMoved(true);
            setEditFx(null);
          }}
        />
      )}
    </div>
  );
}

function FixtureSheet({ f, onClose, onSave, onRemove }: { f: Fixture; onClose: () => void; onSave: (label: string) => void; onRemove: () => void }) {
  const [label, setLabel] = useState(f.label);
  const name = f.kind === "BAR" ? "Barra" : f.kind === "WALL" ? "Pared" : "Texto";
  return (
    <Sheet
      title={name}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap gap-2">
          {f.kind !== "WALL" && (
            <button type="button" onClick={() => onSave(label.trim().slice(0, 30))} className="p-press flex-1 rounded-2xl bg-[var(--p-brand)] py-3 text-sm font-semibold text-white">
              Aplicar
            </button>
          )}
          <button type="button" onClick={onRemove} className="p-press whitespace-nowrap rounded-2xl px-4 py-3 text-sm font-medium text-[var(--p-accent)] hover:bg-[var(--p-accent-soft)]">
            Quitar {name.toLowerCase()}
          </button>
        </div>
      }
    >
      {f.kind === "WALL" ? (
        <p className="text-sm text-[var(--p-muted)]">Arrástrala para moverla y estírala desde la esquina.</p>
      ) : (
        <label className="block text-[13px] font-medium text-[var(--p-muted)]">
          Texto
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} placeholder={f.kind === "BAR" ? "Barra" : "Entrada, Cocina, Baños…"} className="mt-1 w-full rounded-xl border border-[var(--p-line)] px-3 py-2.5 text-sm outline-none focus:border-[var(--p-brand)]" />
        </label>
      )}
      <p className="mt-3 text-xs text-[var(--p-muted)]">Los cambios se guardan con «Guardar plano».</p>
    </Sheet>
  );
}

function OpenSheet({ table, onClose, onOpen }: { table: Table; onClose: () => void; onOpen: (guests: number) => Promise<void> }) {
  const [guests, setGuests] = useState(Math.min(2, table.seats || 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Sheet
      title={`Abrir mesa ${table.name}`}
      onClose={onClose}
      footer={
        <>
          {error && <p className="mb-2 text-sm text-[var(--p-accent)]">{error}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onOpen(guests);
              } catch (e) {
                setError(e instanceof Error ? e.message : "No se pudo abrir la mesa");
                setBusy(false);
              }
            }}
            className="p-press w-full rounded-2xl bg-[var(--p-brand)] py-3.5 text-base font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Abriendo…" : "Abrir y tomar nota"}
          </button>
        </>
      }
    >
      <p className="text-sm text-[var(--p-muted)]">{table.zone} · {table.seats} plazas</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="font-medium">Comensales</span>
        <Stepper value={guests} min={1} max={50} onChange={setGuests} label="comensales" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6, 8].map((n) => (
          <button key={n} type="button" onClick={() => setGuests(n)} aria-pressed={guests === n} className={`p-press h-10 min-w-10 rounded-full px-3 text-sm font-semibold ${guests === n ? "bg-[var(--p-ink)] text-white" : "bg-black/[0.05]"}`}>
            {n}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

const input = "mt-1 w-full rounded-xl border border-[var(--p-line)] px-3 py-2.5 text-sm outline-none focus:border-[var(--p-brand)]";

function ShapePicker({ value, onChange }: { value: Shape; onChange: (s: Shape) => void }) {
  return (
    <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Forma">
      {(
        [
          ["SQUARE", "Mesa", "rounded-md"],
          ["ROUND", "Redonda o taburete", "rounded-full"],
        ] as const
      ).map(([k, label, r]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)} className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-medium ${value === k ? "border-[var(--p-ink)]" : "border-[var(--p-line)]"}`}>
          <span aria-hidden className={`h-5 w-5 shrink-0 bg-black/15 ${r}`} />
          {label}
        </button>
      ))}
    </div>
  );
}

function AddSheet({ zones, defaultZone, onClose, onAdd }: { zones: string[]; defaultZone: string; onClose: () => void; onAdd: (b: { zone: string; prefix: string; from: number; to: number; seats: number; shape: Shape }) => Promise<{ created: number; skipped: number }> }) {
  const [zone, setZone] = useState(defaultZone);
  const [prefix, setPrefix] = useState("");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState(zones.length ? "1" : "10");
  const [seats, setSeats] = useState(4);
  const [shape, setShape] = useState<Shape>("SQUARE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const a = Number(from) || 0;
  const b = Number(to) || 0;
  const n = b >= a && a > 0 ? Math.min(b - a + 1, 100) : 0;
  return (
    <Sheet
      title="Añadir mesas"
      onClose={onClose}
      footer={
        <>
          {error && <p className="mb-2 text-sm text-[var(--p-accent)]">{error}</p>}
          <button
            type="button"
            disabled={busy || !n || !zone.trim()}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onAdd({ zone: zone.trim(), prefix, from: a, to: b, seats, shape });
              } catch (e) {
                setError(e instanceof Error ? e.message : "No se pudieron crear");
                setBusy(false);
              }
            }}
            className="p-press w-full rounded-2xl bg-[var(--p-brand)] py-3.5 text-base font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Creando…" : n ? `Crear ${n} ${n === 1 ? "mesa" : "mesas"}: ${prefix}${a}${n > 1 ? ` a ${prefix}${b}` : ""}` : "Indica cuántas"}
          </button>
        </>
      }
    >
      <label className="block text-[13px] font-medium text-[var(--p-muted)]">
        Zona
        <input value={zone} onChange={(e) => setZone(e.target.value.slice(0, 30))} list="mesas-zonas" placeholder="Interior, Terraza, Barra…" className={input} />
        <datalist id="mesas-zonas">
          {["Interior", "Terraza", "Barra", ...zones].filter((z, i, all) => all.indexOf(z) === i).map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </label>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="block text-[13px] font-medium text-[var(--p-muted)]">
          Letra (opcional)
          <input value={prefix} onChange={(e) => setPrefix(e.target.value.replace(/\s/g, "").slice(0, 4))} placeholder="B, T…" className={input} />
        </label>
        <label className="block text-[13px] font-medium text-[var(--p-muted)]">
          Desde
          <input value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" className={input} />
        </label>
        <label className="block text-[13px] font-medium text-[var(--p-muted)]">
          Hasta
          <input value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" className={input} />
        </label>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Plazas por mesa</span>
        <Stepper value={seats} min={1} max={30} onChange={setSeats} label="plazas" />
      </div>
      <p className="mt-4 text-[13px] font-medium text-[var(--p-muted)]">Forma</p>
      <ShapePicker value={shape} onChange={setShape} />
      <p className="mt-3 text-xs text-[var(--p-muted)]">Si alguna ya existe, no se duplica. Después las colocas en el plano con «Editar mesas».</p>
    </Sheet>
  );
}

function EditSheet({ table, zones, onClose, onSave, onRemove }: { table: Table; zones: string[]; onClose: () => void; onSave: (b: { name: string; zone: string; seats: number; shape: Shape }) => Promise<void>; onRemove: () => Promise<void> }) {
  const [name, setName] = useState(table.name);
  const [zone, setZone] = useState(table.zone);
  const [seats, setSeats] = useState(table.seats);
  const [shape, setShape] = useState<Shape>(table.shape);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha podido hacer");
      setBusy(false);
    }
  };
  return (
    <Sheet
      title={`Mesa ${table.name}`}
      onClose={onClose}
      footer={
        <>
          {error && <p className="mb-2 text-sm text-[var(--p-accent)]">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !name.trim()} onClick={() => run(() => onSave({ name: name.trim(), zone: zone.trim() || table.zone, seats, shape }))} className="p-press flex-1 rounded-2xl bg-[var(--p-brand)] py-3 text-sm font-semibold text-white disabled:opacity-50">
              Guardar
            </button>
            <button type="button" disabled={busy} onClick={async () => (await ask(`¿Quitar la mesa ${table.name}?`)) && run(onRemove)} className="p-press whitespace-nowrap rounded-2xl px-4 py-3 text-sm font-medium text-[var(--p-accent)] hover:bg-[var(--p-accent-soft)]">
              Quitar mesa
            </button>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[13px] font-medium text-[var(--p-muted)]">
          Nombre
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} className={input} />
        </label>
        <label className="block text-[13px] font-medium text-[var(--p-muted)]">
          Zona
          <input value={zone} onChange={(e) => setZone(e.target.value.slice(0, 30))} list="mesas-zonas-edit" className={input} />
          <datalist id="mesas-zonas-edit">
            {zones.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Plazas</span>
        <Stepper value={seats} min={1} max={30} onChange={setSeats} label="plazas" />
      </div>
      <p className="mt-4 text-[13px] font-medium text-[var(--p-muted)]">Forma</p>
      <ShapePicker value={shape} onChange={setShape} />
      {zone.trim() !== table.zone && <p className="mt-3 text-xs text-[var(--p-muted)]">Al cambiarla de zona habrá que volver a colocarla en el plano.</p>}
    </Sheet>
  );
}
