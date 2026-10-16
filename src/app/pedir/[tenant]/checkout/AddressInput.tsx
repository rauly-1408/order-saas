"use client";

import { useEffect, useRef, useState } from "react";
import type { AddressSuggestion } from "@/app/lib/address";

// Dirección con sugerencias mientras se escribe (CartoCiudad). Al elegir un
// portal se rellena también el código postal; si es solo la calle, se deja
// escrita para añadir el número.

type Props = {
  tenant: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (s: AddressSuggestion) => void;
  inputStyle: React.CSSProperties;
};

export default function AddressInput({ tenant, value, onChange, onPick, inputStyle }: Props) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [hint, setHint] = useState("");
  const typed = useRef(false); // solo se busca lo que escribe el cliente, no lo elegido
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!typed.current) return;
    const q = value.trim();
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      if (q.length < 4) return setSuggestions([]);
      fetch(`/api/address/${tenant}?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((d) => {
          setSuggestions(d.suggestions ?? []);
          setActive(-1);
        })
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [tenant, value]);

  function pick(s: AddressSuggestion) {
    typed.current = false;
    setOpen(false);
    setSuggestions([]);
    if (s.complete) {
      setHint("");
      onPick(s);
    } else {
      // Calle sin número: se deja escrita para que añada el portal.
      typed.current = true;
      onChange(`${s.street} `);
      setHint("Añade el número del portal");
      input.current?.focus();
    }
  }

  const show = open && suggestions.length > 0;
  return (
    <div style={{ position: "relative" }}>
      <input
        ref={input}
        style={inputStyle}
        type="text"
        autoComplete="street-address"
        placeholder="Empieza a escribir: calle y número"
        value={value}
        role="combobox"
        aria-expanded={show}
        aria-controls="address-suggestions"
        aria-autocomplete="list"
        onChange={(e) => {
          typed.current = true;
          setHint("");
          setOpen(true);
          onChange(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(suggestions[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        required
      />
      {show && (
        <ul
          id="address-suggestions"
          role="listbox"
          className="absolute inset-x-0 z-30 mt-1 overflow-hidden rounded-xl bg-[var(--surface-0)] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.3)]"
        >
          {suggestions.map((s, i) => (
            <li key={s.label} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className={`flex w-full items-start gap-2 px-4 py-2.5 text-left text-[14px] text-[var(--text-primary)] ${i === active ? "bg-[var(--surface-1)]" : ""}`}
              >
                <span aria-hidden className="mt-0.5">📍</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{s.street}</span>
                  <span className="block truncate text-[12px] text-[var(--text-secondary)]">
                    {s.postalCode ? `${s.postalCode} ` : ""}
                    {s.city}
                    {!s.complete && " · elige y añade el número"}
                  </span>
                </span>
              </button>
            </li>
          ))}
          <li className="px-4 py-1.5 text-right text-[10px] text-[var(--text-secondary)]">Direcciones: CartoCiudad (IGN)</li>
        </ul>
      )}
      {hint && <div className="mt-1.5 text-[13px] font-semibold text-[var(--brand-accent)]">{hint}</div>}
    </div>
  );
}
