import type { IconName } from "./sections";

// Iconos de línea de los apartados (mismo trazo que la barra lateral).
const PATHS: Record<IconName, string> = {
  store: "M4 10h16v10H4zM3 10l2-6h14l2 6M9 20v-5h6v5",
  plan: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3",
  users: "M8 11a3 3 0 100-6 3 3 0 000 6zM2.5 20a5.5 5.5 0 0111 0M16 11a3 3 0 100-6M21.5 20a5.5 5.5 0 00-4-5.3",
  card: "M3 6h18v12H3zM3 10h18M7 15h3",
  cart: "M3 4h2l2.5 11h11L21 7H7M10 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z",
  truck: "M2 7h11v9H2zM13 10h4l3 3v3h-7M6 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z",
  tax: "M6 3h9l4 4v14H6zM15 3v4h4M9 17l6-6M9.5 11.5h.01M14.5 16.5h.01",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  gift: "M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9S10.5 4 8 4.5 7 9 12 9zM12 9s1.5-5 4-4.5S17 9 12 9z",
  globe: "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z",
  brush: "M14 4l6 6-8.5 8.5a3 3 0 01-2.1.9H6v-3.4a3 3 0 01.9-2.1zM13 5l6 6",
  bell: "M6 16V11a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  printer: "M7 8V4h10v4M5 8h14a2 2 0 012 2v6h-4v4H7v-4H3v-6a2 2 0 012-2zM7 15h10",
  lang: "M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M11 5c0 4-3 8-7 9M13 20l4-9 4 9M14.5 17h5",
  doc: "M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7",
};

export default function ConfigIcon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}
