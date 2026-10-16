// Se muestra al instante al cambiar de pestaña mientras llega la página.
export default function PanelLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="animate-pulse">
      <div className="h-9 w-48 rounded-xl bg-black/[0.06]" />
      <div className="mt-3 h-4 w-72 max-w-full rounded-lg bg-black/[0.05]" />
      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]" />
        ))}
      </div>
      <div className="mt-6 h-64 rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]" />
    </div>
  );
}
