// Tarjeta regalo tal como la ve el cliente: color y logo del local, importe,
// a quién va y el código. La usan la vista previa del panel (Configuración →
// Tarjetas regalo) y la página pública de la tarjeta (/pedir/[tenant]/regalo/[código]).
// Sin color-mix ni transparencias de variables: la tablet del local tiene un Safari antiguo.

export type GiftCardVisualProps = {
  storeName: string;
  logoUrl: string | null; // logo cuadrado (o el principal) del local
  color: string; // color principal del local (#rrggbb)
  textColor?: string; // ya no se usa (acabado platino); se acepta por compatibilidad
  amount: string; // «25,00 €»
  recipient: string | null;
  code: string | null; // sin código (vista previa antes de crearla): «XXXX-XXXX-XXXX»
  expires: string | null; // «31/12/2026»
  balance?: string | null; // en la página pública, si ya se ha gastado algo
};

// Acabado platino: degradado plateado con brillo, chip y texto grafito. El
// color del local queda como detalle (una línea bajo el nombre) y manda su logo.
const PLATINUM =
  "linear-gradient(125deg, #f4f5f7 0%, #d7dade 18%, #eef0f2 34%, #b9bec5 52%, #e6e8eb 68%, #c6cad0 84%, #f1f2f4 100%)";
const SHEEN = "linear-gradient(115deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.65) 45%, rgba(255,255,255,0) 60%)";
const BRUSHED = "repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0px, rgba(255,255,255,0.18) 1px, rgba(0,0,0,0.025) 2px, rgba(0,0,0,0) 3px)";

export default function GiftCardVisual({ storeName, logoUrl, color, amount, recipient, code, expires, balance }: GiftCardVisualProps) {
  return (
    <div
      className="relative aspect-[1.586] w-full overflow-hidden rounded-[22px] p-5 text-[#1d2025] shadow-[0_22px_44px_-16px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-1px_0_rgba(0,0,0,0.12)] ring-1 ring-black/10 sm:p-6"
      style={{ backgroundImage: `${SHEEN}, ${BRUSHED}, ${PLATINUM}` }}
      role="img"
      aria-label={`Tarjeta regalo de ${storeName} de ${amount}${recipient ? ` para ${recipient}` : ""}`}
    >
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.2)] sm:h-12 sm:w-12" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-lg font-bold shadow-[0_1px_3px_rgba(0,0,0,0.2)] sm:h-12 sm:w-12" style={{ color }}>
                {storeName.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold sm:text-base">{storeName}</span>
              <span aria-hidden className="mt-1 block h-[3px] w-8 rounded-full" style={{ backgroundColor: color }} />
            </span>
          </div>
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4a4f57] sm:text-[11px]">Platinum</span>
        </div>

        {/* Chip, como en las tarjetas de verdad */}
        <div aria-hidden className="absolute top-[38%] left-0 h-7 w-10 rounded-md bg-[linear-gradient(135deg,#e8e2cf,#b9ae8c_45%,#efe9d8_60%,#a99d7a)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)] sm:h-8 sm:w-11">
          <span className="absolute inset-x-1.5 top-1/2 h-px bg-black/20" />
          <span className="absolute inset-y-1.5 left-1/2 w-px bg-black/20" />
        </div>

        <div className="pl-14 sm:pl-16">
          <p className="text-[32px] font-bold leading-none tracking-tight tabular-nums [text-shadow:0_1px_0_rgba(255,255,255,0.7)] sm:text-[40px]">{balance ?? amount}</p>
          {balance && balance !== amount && <p className="mt-1 text-xs text-[#4a4f57]">Saldo disponible de {amount}</p>}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="min-h-5 truncate text-sm font-semibold uppercase tracking-[0.08em] sm:text-[15px]">{recipient || " "}</p>
            <p className="mt-0.5 font-mono text-xs font-semibold tracking-[0.14em] text-[#3b4048] sm:text-[13px]">{code ?? "XXXX-XXXX-XXXX"}</p>
          </div>
          {expires && <span className="shrink-0 text-[11px] text-[#4a4f57] sm:text-xs">Válida hasta {expires}</span>}
        </div>
      </div>
    </div>
  );
}
