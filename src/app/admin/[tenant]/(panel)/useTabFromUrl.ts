"use client";

import { useEffect } from "react";
import { TAB_EVENT } from "./panelLinks";

// Las pantallas con pestañas las abren desde ?tab= al cargar y, si ya estás en
// ellas, cuando NORA avisa con el evento TAB_EVENT.
export function useTabFromUrl<T extends string>(valid: readonly T[], setTab: (t: T) => void) {
  useEffect(() => {
    const pick = (t: string | null) => t && (valid as readonly string[]).includes(t) && setTab(t as T);
    pick(new URLSearchParams(window.location.search).get("tab"));
    const onTab = (e: Event) => pick((e as CustomEvent<string>).detail);
    window.addEventListener(TAB_EVENT, onTab);
    return () => window.removeEventListener(TAB_EVENT, onTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
