import { Anton, Inter } from "next/font/google";

// Fuentes disponibles para la carta pública. Cada restaurante elige cuáles usa
// desde su branding (bodyFont / headingFont), p. ej. "var(--font-display)".
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Anton({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });

export default function PedirLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${inter.variable} ${display.variable}`}>{children}</div>;
}
