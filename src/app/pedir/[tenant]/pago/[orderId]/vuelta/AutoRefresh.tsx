"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Mientras la pasarela confirma el pago, la página se vuelve a comprobar sola.
export default function AutoRefresh({ everyMs = 3000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [router, everyMs]);
  return null;
}
