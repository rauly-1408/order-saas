"use client";

import { useEffect, useState } from "react";
import { Card, Msg, ghostBtn, input, primaryBtn } from "../ui";

type View = { platformUrl: string; domains: { host: string; dns: "ok" | "pending" | null }[]; cname: string; aRecord: string };

// Dominios: la dirección de la plataforma siempre funciona; además puedes usar
// tu propio dominio (p. ej. pedidos.turestaurante.com).
export default function Dominios({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/domains`;
  const [view, setView] = useState<View | null>(null);
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch(api, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(setView)
      .catch(() => setMsg({ ok: false, text: "No se pudieron cargar los dominios" }));
  }, [api]);

  async function send(kind: string, method: string, body?: unknown, query = "") {
    setBusy(kind);
    setMsg(null);
    try {
      const res = await fetch(api + query, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Algo ha fallado");
      setView(json);
      return true;
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Algo ha fallado" });
      return false;
    } finally {
      setBusy("");
    }
  }

  if (!view) return <p className="text-sm text-[var(--p-muted)]">{msg?.text ?? "Cargando…"}</p>;
  const sub = (host: string) => host.split(".").length > 2;

  return (
    <div className="space-y-5">
      <Card title="Dirección de tu tienda" description="Siempre funciona, tengas o no dominio propio.">
        <a href={view.platformUrl} target="_blank" rel="noopener noreferrer" className="break-all text-sm font-semibold text-[var(--p-brand)] underline">
          {view.platformUrl}
        </a>
      </Card>

      <Card title="Dominio propio" description="Que tu tienda se abra en tu web, por ejemplo pedidos.turestaurante.com. Necesitas un dominio comprado (en IONOS, GoDaddy, DonDominio…).">
        {view.domains.length > 0 && (
          <ul className="mb-4 divide-y divide-[var(--p-line)]">
            {view.domains.map((d) => (
              <li key={d.host} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-semibold">{d.host}</p>
                  <p className="text-xs text-[var(--p-muted)]">
                    {d.dns === "ok" ? "✅ El dominio ya apunta a tu tienda" : d.dns === "pending" ? "⏳ Todavía no apunta aquí (los cambios de DNS pueden tardar unas horas)" : "Pulsa «Comprobar» para ver si ya funciona"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={!!busy} onClick={() => send("check", "GET", undefined, "?check=1")} className={`${ghostBtn} !px-3 !py-1.5 text-xs`}>
                    {busy === "check" ? "Comprobando…" : "Comprobar"}
                  </button>
                  <button type="button" disabled={!!busy} onClick={() => confirm(`¿Quitar ${d.host}?`) && send("del", "DELETE", { domain: d.host })} className={`${ghostBtn} !px-3 !py-1.5 text-xs`}>
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="pedidos.turestaurante.com" className={`${input} !mt-0 flex-1`} aria-label="Dominio" />
          <button type="button" disabled={!!busy || !domain.trim()} onClick={async () => (await send("add", "POST", { domain })) && setDomain("")} className={primaryBtn}>
            Añadir dominio
          </button>
        </div>
        <Msg msg={msg} />
      </Card>

      {view.domains.length > 0 && (
        <Card title="Cómo conectarlo" description="Dos pasos. Si no te aclaras, pásale esto a quien te lleve la web.">
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>
              En el panel de tu dominio (DNS), crea este registro:
              <div className="-mx-1 mt-2 overflow-x-auto">
                <table className="min-w-[420px] text-left text-xs">
                  <thead className="text-[var(--p-muted)]">
                    <tr>
                      <th className="px-1 py-1 font-medium">Tipo</th>
                      <th className="px-1 py-1 font-medium">Nombre</th>
                      <th className="px-1 py-1 font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {view.domains.map((d) =>
                      sub(d.host) ? (
                        <tr key={d.host}>
                          <td className="px-1 py-1">CNAME</td>
                          <td className="px-1 py-1">{d.host.split(".")[0]}</td>
                          <td className="px-1 py-1">{view.cname}</td>
                        </tr>
                      ) : (
                        <tr key={d.host}>
                          <td className="px-1 py-1">A</td>
                          <td className="px-1 py-1">@</td>
                          <td className="px-1 py-1">{view.aRecord}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </li>
            <li>Avisa al equipo de la plataforma para que active el dominio en el servidor (Vercel → Domains) y su certificado de seguridad (https). Tarda unos minutos.</li>
          </ol>
        </Card>
      )}
    </div>
  );
}
