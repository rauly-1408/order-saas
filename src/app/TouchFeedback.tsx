"use client";

import { useEffect } from "react";

// Safari de iPhone no aplica :active (el «hundido» al pulsar un botón) si la
// página no escucha el toque. Un oyente vacío y pasivo basta para que la
// respuesta al dedo sea inmediata en toda la web. No bloquea el desplazamiento.
export default function TouchFeedback() {
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);
  return null;
}
