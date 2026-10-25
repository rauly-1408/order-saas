"use client";

import { useCallback, useEffect, useState } from "react";
import type { InvoiceLineRecord, VatRow } from "@/app/lib/invoice";
import { euros } from "./types";

// Facturas de proveedor guardadas al leerlas con IA: lo gastado por mes (base,
// IVA soportado y total) y cada factura con sus líneas tal cual. Ver docs/MODULO-COSTES.md

type Invoice = {
  id: string;
  supplierName: string;
  supplierTaxId: string | null;
  number: string | null;
  date: string | null;
  createdAt: string;
  baseCents: number;
  vatCents: number;
  totalCents: number;
  expenseCents: number;
  vatBreakdown: VatRow[];
  lines: InvoiceLineRecord[];
};
type Month = { month: string; baseCents: number; vatCents: number; totalCents: number; count: number };

const monthName = (m: string) => {
  const t = new Date(`${m}-15T12:00:00Z`).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1); // «Septiembre de 2026»
};
const day = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
const num = (n: number, max = 4) => n.toLocaleString("es-ES", { maximumFractionDigits: max });

export default function FacturasProveedor({ api, refresh }: { api: string; refresh: number }) {
  const [data, setData] = useState<{ invoices: Invoice[]; months: Month[] } | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${api}/invoices`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudieron cargar las facturas");
      setData(json);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las facturas");
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load, refresh]);

  if (error) return <p className="text-sm text-[var(--p-accent)]">{error}</p>;
  if (!data || !data.invoices.length) return null;
  const [current, previous] = data.months;

  return (
    <section className="rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
      <h2 className="text-[17px] font-semibold">Facturas de proveedor</h2>
      <p className="text-sm text-[var(--p-muted)]">Las que has leído con la cámara, con su IVA. Pásaselas a tu gestoría con estos totales.</p>

      {current && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[current, previous].filter(Boolean).map((m) => (
            <div key={m!.month} className="rounded-xl bg-black/[0.03] p-3">
              <p className="text-xs font-medium text-[var(--p-muted)]">
                {monthName(m!.month)} · {m!.count} {m!.count === 1 ? "factura" : "facturas"}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{euros(m!.totalCents)}</p>
              <p className="text-xs text-[var(--p-muted)] tabular-nums">
                Base {euros(m!.baseCents)} · IVA soportado {euros(m!.vatCents)}
              </p>
            </div>
          ))}
        </div>
      )}

      <ul className="mt-4 divide-y divide-[var(--p-line)]">
        {data.invoices.map((inv) => {
          const isOpen = open === inv.id;
          return (
            <li key={inv.id}>
              <button type="button" onClick={() => setOpen(isOpen ? null : inv.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 py-3 text-left">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{inv.supplierName}</p>
                  <p className="truncate text-xs text-[var(--p-muted)]">
                    {day(inv.date ?? inv.createdAt)}
                    {inv.number && <> · nº {inv.number}</>} · {inv.lines.length} líneas
                  </p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p className="text-sm font-semibold">{euros(inv.totalCents)}</p>
                  <p className="text-xs text-[var(--p-muted)]">IVA {euros(inv.vatCents)}</p>
                </div>
                <span className={`shrink-0 text-[var(--p-muted)] transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden>
                  ›
                </span>
              </button>
              {isOpen && (
                <div className="pb-4">
                  <p className="text-xs text-[var(--p-muted)] tabular-nums">
                    Base {euros(inv.baseCents)} · {inv.vatBreakdown.map((v) => `IVA ${num(v.pct, 1)} %: ${euros(v.vatCents)}`).join(" · ")} · Total {euros(inv.totalCents)}
                    {inv.expenseCents > 0 && <> · de ello, gastos que no son ingredientes: {euros(inv.expenseCents)} sin IVA</>}
                    {inv.supplierTaxId && <> · NIF {inv.supplierTaxId}</>}
                  </p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-xs tabular-nums">
                      <thead className="text-left text-[var(--p-muted)]">
                        <tr>
                          <th className="py-1 pr-2 font-medium">Producto</th>
                          <th className="py-1 pr-2 text-right font-medium">Unid.</th>
                          <th className="py-1 pr-2 text-right font-medium">Precio</th>
                          <th className="py-1 pr-2 text-right font-medium">Base</th>
                          <th className="py-1 pr-2 text-right font-medium">IVA</th>
                          <th className="py-1 text-right font-medium">Importe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--p-line)]">
                        {inv.lines.map((l, i) => (
                          <tr key={i}>
                            <td className="py-1 pr-2">
                              {l.description}
                              {l.kind === "EXPENSE" && <span className="ml-1 rounded-full bg-black/[0.06] px-1.5 text-[10px] text-[var(--p-muted)]">gasto</span>}
                            </td>
                            <td className="py-1 pr-2 text-right">{l.docQuantity != null ? `${num(l.docQuantity, 3)} ${l.docUnit ?? ""}` : "—"}</td>
                            <td className="py-1 pr-2 text-right">{l.unitPrice != null ? `${num(l.unitPrice)} €` : "—"}</td>
                            <td className="py-1 pr-2 text-right">{l.lineTotalCents != null ? euros(l.lineTotalCents) : "—"}</td>
                            <td className="py-1 pr-2 text-right">{l.vatPct != null ? `${num(l.vatPct, 1)} %` : "—"}</td>
                            <td className="py-1 text-right font-medium">{l.lineTotalWithVatCents != null ? euros(l.lineTotalWithVatCents) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
