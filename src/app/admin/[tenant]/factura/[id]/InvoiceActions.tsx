"use client";

import Link from "next/link";
import { useState } from "react";

// Barra de la hoja de factura: volver, imprimir (o guardar en PDF) y enviar por email.
export default function InvoiceActions({ tenant, id, canEmail }: { tenant: string; id: string; canEmail: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({ busy: false, msg: null, ok: false });

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true, msg: null, ok: false });
    const res = await fetch(`/api/admin/${tenant}/facturas/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : { error: "Sin conexión" };
    setState(res?.ok ? { busy: false, msg: `Enviada a ${email}`, ok: true } : { busy: false, msg: data.error ?? "No se pudo enviar", ok: false });
  }

  return (
    <div className="mx-auto mb-4 max-w-[210mm] space-y-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/${tenant}/facturas`} className="flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold shadow-sm">
          ‹ Facturas
        </Link>
        <button type="button" onClick={() => window.print()} className="ml-auto min-h-11 rounded-full bg-neutral-900 px-5 text-sm font-semibold text-white">
          Imprimir o guardar PDF
        </button>
      </div>
      {canEmail && (
        <form onSubmit={send} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email del cliente" aria-label="Email del cliente" className="min-h-11 min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 text-sm" />
          <button type="submit" disabled={state.busy} className="min-h-11 rounded-full bg-neutral-100 px-5 text-sm font-semibold disabled:opacity-50">
            {state.busy ? "Enviando…" : "Enviar por email"}
          </button>
          {state.msg && <p className={`basis-full text-sm ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.msg}</p>}
        </form>
      )}
    </div>
  );
}
