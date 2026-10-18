"use client";

import { useState } from "react";
import { includedTax, readTax, TAX_RATES, type TaxSettings } from "@/app/lib/storePolicies";
import { Card, Toggle, euros, input, toast, useSaveBar, useTenantSettings } from "../ui";

export default function Impuestos({ tenant }: { tenant: string }) {
  const { settings, error, save } = useTenantSettings(tenant);
  const [form, setForm] = useState<TaxSettings | null>(null);
  const f = form ?? (settings ? readTax(settings) : null);
  if (!f) return <p className="text-sm text-[var(--p-muted)]">{error || "Cargando…"}</p>;
  return <ImpuestosForm f={f} dirty={!!form && JSON.stringify(form) !== JSON.stringify(readTax(settings))} setForm={setForm} save={save} />;
}

function ImpuestosForm({ f, dirty, setForm, save }: { f: TaxSettings; dirty: boolean; setForm: (v: TaxSettings | null) => void; save: (p: Record<string, unknown>) => Promise<void> }) {
  useSaveBar("impuestos", {
    dirty,
    discard: () => setForm(null),
    save: async () => {
      try {
        await save({ tax: f });
        setForm(null);
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo guardar", false);
        return false;
      }
    },
  });

  return (
    <div className="space-y-5">
      <Card
        title="IVA de tus precios"
        description="Los precios de tu carta ya incluyen el IVA. En España la comida preparada para llevar o a domicilio va al 10 %; algunos productos van al 4 % o al 21 %. Si dudas, pregunta a tu gestor."
      >
        <label className="block max-w-xs text-xs text-[var(--p-muted)]">
          Tipo de IVA
          <select value={f.rate} onChange={(e) => setForm({ ...f, rate: Number(e.target.value) })} className={input}>
            {TAX_RATES.map((r) => (
              <option key={r} value={r}>
                {r} %{r === 10 ? " (comida preparada)" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3 divide-y divide-[var(--p-line)]">
          <Toggle checked={f.showOnReceipt} onChange={(v) => setForm({ ...f, showOnReceipt: v })} label="Mostrar «IVA incluido» en la confirmación del pedido" hint={`Ejemplo: en un pedido de 20,00 € → IVA incluido (${f.rate} %): ${euros(includedTax(2000, f.rate))}`} />
        </div>
      </Card>
      <p className="text-xs text-[var(--p-muted)]">El desglose del IVA también aparece en Informes. La factura legal (si el cliente la pide) la emite tu programa de facturación.</p>
    </div>
  );
}
