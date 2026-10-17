"use client";

import { useEffect, useState } from "react";
import DatosNegocio from "./DatosNegocio";
import { readBusiness, type BusinessInfo } from "@/app/lib/business";
import { readPanelCache, writePanelCache } from "../../panelCache";

// Información del negocio (datos legales y de contacto): salen en el pie de la
// tienda y rellenan los textos legales.
export default function NegocioClient({ tenant }: { tenant: string }) {
  const cacheKey = `negocio:${tenant}`;
  const [business, setBusiness] = useState<BusinessInfo | null>(() => readPanelCache<BusinessInfo>(cacheKey) ?? null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/${tenant}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((data) => {
        const biz = readBusiness(data.tenant?.settings);
        writePanelCache(cacheKey, biz);
        setBusiness(biz);
      })
      .catch(() => setError("No se pudieron cargar los datos del negocio"));
  }, [tenant, cacheKey]);

  if (!business) return <p className="py-10 text-sm text-[var(--p-muted)]">{error || "Cargando…"}</p>;
  return (
    <DatosNegocio
      tenant={tenant}
      initial={business}
      onSaved={(b) => {
        setBusiness(b);
        writePanelCache(cacheKey, b);
      }}
    />
  );
}
