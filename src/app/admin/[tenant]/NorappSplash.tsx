import { Figtree, Martian_Mono } from "next/font/google";

// Pantalla de carga de NorApp (marca C «Ticket»): sale un ticket con la N y el
// nombre. Es la capa de la plataforma; dentro del panel mandan los colores de
// cada restaurante. «long» (1,8 s, al entrar por primera vez) o «short» (0,8 s,
// la primera vez de cada día). Las animaciones están en globals.css (.nsplash).
// Ver docs/MARCA-NORAPP.md
const mono = Martian_Mono({ subsets: ["latin"], weight: "800", variable: "--font-norapp-mono", display: "swap" });
const sans = Figtree({ subsets: ["latin"], weight: "500", variable: "--font-norapp", display: "swap" });

export default function NorappSplash({ mode, id }: { mode: "long" | "short"; id?: string }) {
  return (
    <div id={id} suppressHydrationWarning className={`nsplash nsplash-${mode} ${mono.variable} ${sans.variable}`} role="status" aria-label="NorApp, cargando">
      <svg width="112" height="112" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <clipPath id={`nsplash-clip-${mode}`}>
            <rect x="0" y="0" width="100" height="74" />
          </clipPath>
        </defs>
        <g clipPath={`url(#nsplash-clip-${mode})`}>
          <g className="nsplash-paper">
            <path d="M28 10 H72 V66 L67 70 L62 66 L57 70 L52 66 L47 70 L42 66 L37 70 L32 66 L28 70 Z" fill="#fafaf8" />
            <text x="50" y="44" textAnchor="middle" fontFamily="var(--font-norapp-mono), monospace" fontWeight="800" fontSize="26" fill="#111214">
              N
            </text>
            <rect x="36" y="52" width="28" height="3" rx="1.5" fill="#ff6a13" />
          </g>
        </g>
        <rect x="18" y="72" width="64" height="12" rx="6" fill="#2a2c31" />
        <rect x="24" y="76" width="52" height="3" rx="1.5" fill="#111214" />
      </svg>
      <p className="nsplash-word">
        nor<span>app</span>
      </p>
      <p className="nsplash-sub">Cada pedido, al momento.</p>
    </div>
  );
}
