// Previsión de ventas por día de la semana (Costes → Previsión).
// Funciones puras: el historial ya llega agrupado por día local.
//
// Método: media ponderada del mismo día de la semana en las últimas semanas;
// la semana más reciente pesa más (8, 7, 6…). Los días sin ningún pedido se
// toman como cerrados y no cuentan, para no hundir la media.

export type DaySales = {
  ymd: string; // fecha local AAAA-MM-DD
  isoWeekday: number; // 1 = lunes … 7 = domingo
  orders: number;
  revenueCents: number;
  products: Record<string, number>; // unidades por producto
  ingredients: Record<string, number>; // consumo por ingrediente (unidad base)
  hours: Record<number, number>; // pedidos por hora local
};

export type Forecast = {
  ymd: string;
  isoWeekday: number;
  basedOn: string[]; // fechas usadas, de la más reciente a la más antigua
  orders: number;
  ordersMin: number;
  ordersMax: number;
  revenueCents: number;
  products: { id: string; units: number; min: number; max: number }[];
  ingredients: Record<string, number>;
  peakHour: number | null; // hora con más pedidos de media
};

export const FORECAST_WEEKS = 8;

function weightedMean(values: number[], weights: number[]): number {
  const w = weights.reduce((a, b) => a + b, 0);
  return w > 0 ? values.reduce((a, v, i) => a + v * weights[i], 0) / w : 0;
}

// Previsión para `ymd` con el historial anterior a ese día.
export function forecastDay(history: DaySales[], ymd: string, isoWeekday: number, weeks = FORECAST_WEEKS): Forecast {
  const oldest = shiftYmd(ymd, -7 * weeks);
  const same = history
    .filter((d) => d.isoWeekday === isoWeekday && d.ymd < ymd && d.ymd >= oldest && d.orders > 0)
    .sort((a, b) => b.ymd.localeCompare(a.ymd));
  // Peso según lo lejos que quede: hace 1 semana → `weeks`, hace `weeks` semanas → 1.
  const weights = same.map((d) => Math.max(1, weeks + 1 - Math.round(daysBetweenYmd(d.ymd, ymd) / 7)));
  const mean = (pick: (d: DaySales) => number) => weightedMean(same.map(pick), weights);

  const productIds = new Set(same.flatMap((d) => Object.keys(d.products)));
  const products = [...productIds]
    .map((id) => {
      const vals = same.map((d) => d.products[id] ?? 0);
      return { id, units: Math.round(weightedMean(vals, weights)), min: Math.min(...vals), max: Math.max(...vals) };
    })
    .filter((p) => p.units > 0)
    .sort((a, b) => b.units - a.units);

  const ingredientIds = new Set(same.flatMap((d) => Object.keys(d.ingredients)));
  const ingredients: Record<string, number> = {};
  for (const id of ingredientIds) {
    const q = mean((d) => d.ingredients[id] ?? 0);
    if (q > 0) ingredients[id] = q;
  }

  let peakHour: number | null = null;
  let peak = 0;
  for (let h = 0; h < 24; h++) {
    const v = mean((d) => d.hours[h] ?? 0);
    if (v > peak + 1e-9) {
      peak = v;
      peakHour = h;
    }
  }

  const orderVals = same.map((d) => d.orders);
  return {
    ymd,
    isoWeekday,
    basedOn: same.map((d) => d.ymd),
    orders: Math.round(mean((d) => d.orders)),
    ordersMin: orderVals.length ? Math.min(...orderVals) : 0,
    ordersMax: orderVals.length ? Math.max(...orderVals) : 0,
    revenueCents: Math.round(mean((d) => d.revenueCents)),
    products,
    ingredients,
    peakHour,
  };
}

// Suma de varias previsiones (p. ej. «los próximos 7 días»).
export function sumForecasts(list: Forecast[]): Pick<Forecast, "orders" | "revenueCents" | "products" | "ingredients"> {
  const products = new Map<string, { id: string; units: number; min: number; max: number }>();
  const ingredients: Record<string, number> = {};
  for (const f of list) {
    for (const p of f.products) {
      const cur = products.get(p.id) ?? { id: p.id, units: 0, min: 0, max: 0 };
      products.set(p.id, { id: p.id, units: cur.units + p.units, min: cur.min + p.min, max: cur.max + p.max });
    }
    for (const [id, q] of Object.entries(f.ingredients)) ingredients[id] = (ingredients[id] ?? 0) + q;
  }
  return {
    orders: list.reduce((a, f) => a + f.orders, 0),
    revenueCents: list.reduce((a, f) => a + f.revenueCents, 0),
    products: [...products.values()].sort((a, b) => b.units - a.units),
    ingredients,
  };
}

// Acierto de una previsión frente a lo que pasó: 100 % = clavado.
export function accuracyPct(forecast: number, actual: number): number | null {
  if (forecast <= 0 && actual <= 0) return null;
  const base = Math.max(forecast, actual);
  return Math.round((1 - Math.abs(forecast - actual) / base) * 100);
}

// Lo que hace falta para cubrir `need` con `stock`, con un margen de seguridad.
export function shortfall(need: number, stock: number, safetyPct = 10): number {
  const want = need * (1 + safetyPct / 100);
  return want > stock ? want - Math.max(stock, 0) : 0;
}

function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daysBetweenYmd(from: string, to: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(to) - t(from)) / 86_400_000);
}
