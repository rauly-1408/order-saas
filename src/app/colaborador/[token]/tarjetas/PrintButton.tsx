"use client";

export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="mt-6 w-full rounded-full bg-[#1d1d1f] py-3 text-sm font-semibold text-white">
      Imprimir (10 por folio)
    </button>
  );
}
