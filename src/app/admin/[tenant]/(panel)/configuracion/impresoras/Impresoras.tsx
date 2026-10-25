"use client";

import { ask } from "@/app/lib/dialog";
import { useCallback, useEffect, useState } from "react";
import Reparto from "./Reparto";
import { Card, Toggle, ghostBtn, input, primaryBtn, toast, useSaveBar } from "../ui";

// Configuración → Impresoras: impresoras de tickets del local, qué imprime
// cada una, el agente que las conecta con la app y las últimas impresiones.
// Ver docs/IMPRESION.md

type Printer = { id: string; name: string; host: string; port: number; roles: ("kitchen" | "receipt")[]; width: 48 | 42 | 32; codepage: "cp858" | "ascii"; drawer: boolean; copies: number; storeId: string | null; categories: string[] | null };
type Job = { id: string; kind: string; status: string; printerId: string; error: string | null; createdAt: string; printedAt: string | null; orderId: string | null };
type Data = { stores?: { id: string; name: string }[]; categories?: { id: string; name: string }[]; agentToken: string | null; agentSeenAt: string | null; agentOnline: boolean; autoKitchen: boolean; autoReceipt: boolean; printers: Printer[]; pending: number; recent: Job[] };
type Form = { printers: Printer[]; autoKitchen: boolean; autoReceipt: boolean };

const KIND: Record<string, string> = { KITCHEN: "Comanda", RECEIPT: "Ticket", TEST: "Prueba", CLOSING: "Cierre de caja" };
const STATUS: Record<string, string> = { PENDING: "Pendiente", PRINTED: "Impreso", FAILED: "Fallido" };
const newPrinter = (): Printer => ({ id: Math.random().toString(36).slice(2, 10), name: "", host: "", port: 9100, roles: ["kitchen", "receipt"], width: 48, codepage: "cp858", drawer: false, copies: 1, storeId: null, categories: null });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

export default function Impresoras({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/printers`;
  const [data, setData] = useState<Data | null>(null);
  const [edits, setEdits] = useState<Form | null>(null);
  const [busy, setBusy] = useState("");
  const [showToken, setShowToken] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(api, { cache: "no-store" });
    if (res.ok) setData((await res.json()) as Data);
  }, [api]);
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000); // estado del agente y últimas impresiones
    return () => clearInterval(t);
  }, [load]);

  const saved: Form | null = data && { printers: data.printers, autoKitchen: data.autoKitchen, autoReceipt: data.autoReceipt };
  const form = edits ?? saved;
  const dirty = !!edits && JSON.stringify(edits) !== JSON.stringify(saved);
  useSaveBar("impresoras", {
    dirty,
    discard: () => setEdits(null),
    save: async () => {
      const res = await fetch(api, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(json.error ?? "No se pudo guardar", false);
        return false;
      }
      setData(json as Data);
      setEdits(null);
      return true;
    },
  });

  async function action(body: Record<string, unknown>, key: string, okMsg: string) {
    setBusy(key);
    try {
      const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo hacer");
      setData(json as Data);
      toast(okMsg);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo hacer", false);
    } finally {
      setBusy("");
    }
  }

  const patch = (i: number, p: Partial<Printer>) => form && setEdits({ ...form, printers: form.printers.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const toggleRole = (i: number, role: "kitchen" | "receipt") => {
    const p = form!.printers[i];
    patch(i, { roles: p.roles.includes(role) ? p.roles.filter((r) => r !== role) : [...p.roles, role] });
  };

  if (!data || !form) return <p className="text-sm text-[var(--p-muted)]">Cargando…</p>;

  return (
    <div className="space-y-5">
      <Card
        title="Agente de impresión"
        description="Un programa pequeño en un ordenador del local conecta la app con tus impresoras. Instálalo una vez; después funciona solo."
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${data.agentOnline ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
            <span className={`h-2 w-2 rounded-full ${data.agentOnline ? "bg-emerald-500" : "bg-amber-500"}`} />
            {data.agentOnline ? "Agente conectado" : data.agentSeenAt ? `Sin señal desde las ${hhmm(data.agentSeenAt)}` : "Agente sin instalar"}
          </span>
          {data.pending > 0 && <span className="text-sm text-[var(--p-muted)]">{data.pending} en cola</span>}
        </div>
        {data.agentToken ? (
          <div className="mt-4">
            <p className="text-sm font-medium">Token del agente</p>
            <p className="mt-0.5 text-xs text-[var(--p-muted)]">Pégalo en el programa del local. Es como una contraseña: no lo compartas.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded-lg bg-black/[0.05] px-3 py-2 text-sm">{showToken ? data.agentToken : "•".repeat(24)}</code>
              <button type="button" onClick={() => setShowToken((v) => !v)} className={`${ghostBtn} !px-3 !py-1.5 text-xs`}>
                {showToken ? "Ocultar" : "Mostrar"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(data.agentToken!);
                    toast("Token copiado");
                  } catch {
                    toast("No se pudo copiar; pulsa «Mostrar» y cópialo a mano", false);
                  }
                }}
                className={`${ghostBtn} !px-3 !py-1.5 text-xs`}
              >
                Copiar
              </button>
              <button type="button" disabled={busy === "token"} onClick={async () => (await ask("¿Crear un token nuevo? El anterior dejará de funcionar y habrá que cambiarlo en el programa del local.")) && action({ action: "newToken" }, "token", "Token nuevo creado")} className={`${ghostBtn} !px-3 !py-1.5 text-xs`}>
                Nuevo token
              </button>
            </div>
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-[var(--p-muted)]">
              <li>En el PC del local, instala Node.js (nodejs.org, versión LTS).</li>
              <li>
                Descarga el <a href="/print-agent/agent.js" download className="font-medium text-[var(--p-brand)] underline">programa del agente</a> y guárdalo en una carpeta, por ejemplo <code>C:\impresion</code>.
              </li>
              <li>
                Ábrelo desde el Símbolo del sistema: <code className="rounded bg-black/[0.05] px-1.5 py-0.5 text-xs">node agent.js --url {typeof location !== "undefined" ? location.origin : ""} --token TU_TOKEN</code>
              </li>
              <li>Cuando aquí ponga «Agente conectado», pulsa «Imprimir prueba» en cada impresora.</li>
            </ol>
            <p className="mt-2 text-xs text-[var(--p-muted)]">
              Guía completa, con cómo dejarlo arrancando solo con Windows:{" "}
              <a href="/print-agent/README.md" target="_blank" rel="noreferrer" className="underline">
                instrucciones
              </a>
              .
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--p-muted)]">Añade tu primera impresora y guarda: aquí aparecerá el token para el programa del local.</p>
        )}
      </Card>

      <Card title="Impresoras" description="Impresoras térmicas de tickets conectadas por red (Ethernet o Wi-Fi), con IP fija. Las que van solo por USB no se pueden usar.">
        <ul className="space-y-4">
          {form.printers.length === 0 && <li className="text-sm text-[var(--p-muted)]">Todavía no hay impresoras.</li>}
          {form.printers.map((p, i) => (
            <li key={p.id} className="rounded-2xl border border-[var(--p-line)] p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Nombre
                  <input value={p.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="Cocina, Barra, Mostrador…" className={input} />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="col-span-2 text-sm">
                    Dirección IP
                    <input value={p.host} onChange={(e) => patch(i, { host: e.target.value.trim() })} placeholder="192.168.1.31" inputMode="decimal" className={input} />
                    <span className="mt-1 block text-xs text-[var(--p-muted)]">De tu red: 192.168.x.x, 10.x.x.x o 172.16–31.x.x</span>
                  </label>
                  <label className="text-sm">
                    Puerto
                    <input value={p.port} onChange={(e) => patch(i, { port: Number(e.target.value) || 9100 })} inputMode="numeric" className={input} />
                  </label>
                </div>
              </div>
              {(data.stores?.length ?? 0) > 1 && (
                <label className="mt-3 block text-sm">
                  Local
                  <select value={p.storeId ?? ""} onChange={(e) => patch(i, { storeId: e.target.value || null })} className={input}>
                    <option value="">Todos los locales</option>
                    {data.stores!.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-[var(--p-muted)]">Imprime solo los pedidos de ese local. Con varios locales, cada uno necesita su agente con su local (ver instrucciones).</span>
                </label>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    ["kitchen", "Comandas a cocina"],
                    ["receipt", "Tickets al cliente"],
                  ] as const
                ).map(([role, label]) => (
                  <button key={role} type="button" onClick={() => toggleRole(i, role)} aria-pressed={p.roles.includes(role)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${p.roles.includes(role) ? "bg-[var(--p-ink)] text-white" : "bg-black/[0.05]"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <label className="text-sm">
                  Papel
                  <select value={p.width} onChange={(e) => patch(i, { width: Number(e.target.value) as 48 | 42 | 32 })} className={input}>
                    <option value={48}>80 mm (48 caracteres)</option>
                    <option value={42}>80 mm, letra grande (42)</option>
                    <option value={32}>58 mm (32 caracteres)</option>
                  </select>
                </label>
                <label className="text-sm">
                  Acentos
                  <select value={p.codepage} onChange={(e) => patch(i, { codepage: e.target.value as "cp858" | "ascii" })} className={input}>
                    <option value="cp858">Con acentos y €</option>
                    <option value="ascii">Sin acentos (si salen símbolos raros)</option>
                  </select>
                </label>
                <label className="text-sm">
                  Copias de comanda
                  <select value={p.copies} onChange={(e) => patch(i, { copies: Number(e.target.value) })} className={input}>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <Toggle checked={p.drawer} onChange={(v) => patch(i, { drawer: v })} label="Abre el cajón" hint="Al cobrar en efectivo" />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={dirty || busy === `test-${p.id}` || !data.printers.some((x) => x.id === p.id)} onClick={() => action({ action: "test", printerId: p.id }, `test-${p.id}`, "Prueba enviada: saldrá en unos segundos si el agente está conectado")} className={`${ghostBtn} !px-3 !py-1.5 text-xs`} title={dirty ? "Guarda primero los cambios" : undefined}>
                  Imprimir prueba
                </button>
                <button type="button" onClick={() => setEdits({ ...form, printers: form.printers.filter((_, j) => j !== i) })} className={`${ghostBtn} !px-3 !py-1.5 text-xs text-red-600`}>
                  Quitar
                </button>
              </div>
            </li>
          ))}
        </ul>
        {form.printers.length < 6 && (
          <button type="button" onClick={() => setEdits({ ...form, printers: [...form.printers, newPrinter()] })} className={`${primaryBtn} mt-4`}>
            Añadir impresora
          </button>
        )}
      </Card>

      {(data.categories?.length ?? 0) > 0 && <Reparto printers={form.printers} categories={data.categories!} onChange={(printers) => setEdits({ ...form, printers })} />}

      <Card title="Qué se imprime solo" description="Además, en Pedidos puedes reimprimir la comanda o el ticket de cualquier pedido.">
        <Toggle checked={form.autoKitchen} onChange={(v) => setEdits({ ...form, autoKitchen: v })} label="Comanda a cocina al entrar un pedido" hint="Online (ya pagado o al recoger) y de la Caja." />
        <Toggle checked={form.autoReceipt} onChange={(v) => setEdits({ ...form, autoReceipt: v })} label="Ticket al cliente al cobrar en la Caja" hint="Efectivo, datáfono o Bizum. Los pedidos online no imprimen ticket solos." />
      </Card>

      {data.recent.length > 0 && (
        <Card title="Últimas impresiones">
          <ul className="divide-y divide-[var(--p-line)] text-sm">
            {data.recent.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="text-[var(--p-muted)]">{hhmm(j.createdAt)}</span> {KIND[j.kind] ?? j.kind} · {data.printers.find((p) => p.id === j.printerId)?.name ?? "impresora quitada"}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${j.status === "PRINTED" ? "bg-emerald-50 text-emerald-700" : j.status === "FAILED" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-800"}`} title={j.error ?? undefined}>
                  {STATUS[j.status] ?? j.status}
                  {j.error ? ` · ${j.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
