import type { PricePoint, ShoppingListItem, Store } from './types';

export interface OptimizerOptions {
  /** Máximo de supermercados a visitar (1 = un único súper). */
  maxStores: number;
  /** Coste "de molestia" en € por cada parada adicional. Evita sugerir 3 súper para ahorrar 0,40 €. */
  extraStorePenalty: number;
  /** € por km de desplazamiento (ida y vuelta se calcula aparte). 0 para ignorar la ubicación. */
  costPerKm: number;
}

export const DEFAULT_OPTIONS: OptimizerOptions = {
  maxStores: 2,
  extraStorePenalty: 1.5,
  costPerKm: 0.15,
};

export interface Assignment {
  productId: string;
  storeId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface BasketPlan {
  storeIds: string[];
  assignments: Assignment[];
  /** Productos que ningún súper del plan tiene con precio conocido. */
  missing: string[];
  itemsCost: number;
  travelCost: number;
  /** itemsCost + travelCost + penalización por paradas extra: lo que se minimiza. */
  score: number;
}

export interface OptimizationResult {
  best: BasketPlan;
  bestSingle: BasketPlan;
  /** Planes alternativos ordenados, para que el usuario elija. */
  alternatives: BasketPlan[];
  /** Ahorro en productos del plan óptimo frente al mejor súper único. */
  savingsVsSingle: number;
  /** Ahorro frente al súper único más caro (con la misma cobertura). */
  savingsVsWorst: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function* combinations<T>(arr: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield acc.slice();
    return;
  }
  for (let i = start; i < arr.length; i++) {
    acc.push(arr[i]);
    yield* combinations(arr, k, i + 1, acc);
    acc.pop();
  }
}

/** Indexa el último precio por producto y súper. */
export function buildPriceIndex(prices: PricePoint[]): Map<string, Map<string, number>> {
  const latest = new Map<string, PricePoint>();
  for (const p of prices) {
    const key = `${p.productId}|${p.storeId}`;
    const prev = latest.get(key);
    if (!prev || p.observedAt > prev.observedAt) latest.set(key, p);
  }
  const index = new Map<string, Map<string, number>>();
  for (const p of latest.values()) {
    if (!index.has(p.productId)) index.set(p.productId, new Map());
    index.get(p.productId)!.set(p.storeId, p.price);
  }
  return index;
}

function evaluate(
  subset: Store[],
  items: ShoppingListItem[],
  index: Map<string, Map<string, number>>,
  opts: OptimizerOptions,
): BasketPlan {
  const assignments: Assignment[] = [];
  const missing: string[] = [];
  for (const item of items) {
    const byStore = index.get(item.productId);
    let best: { storeId: string; price: number } | null = null;
    for (const s of subset) {
      const price = byStore?.get(s.id);
      if (price !== undefined && (!best || price < best.price)) best = { storeId: s.id, price };
    }
    if (!best) {
      missing.push(item.productId);
      continue;
    }
    assignments.push({
      productId: item.productId,
      storeId: best.storeId,
      quantity: item.quantity,
      unitPrice: best.price,
      subtotal: round2(best.price * item.quantity),
    });
  }

  // Un súper del subconjunto al que no se asigna nada no se visita.
  const used = subset.filter((s) => assignments.some((a) => a.storeId === s.id));
  const itemsCost = round2(assignments.reduce((acc, a) => acc + a.subtotal, 0));
  const travelCost = round2(used.reduce((acc, s) => acc + (s.distanceKm ?? 0) * 2 * opts.costPerKm, 0));
  const penalty = Math.max(0, used.length - 1) * opts.extraStorePenalty;
  return {
    storeIds: used.map((s) => s.id),
    assignments,
    missing,
    itemsCost,
    travelCost,
    score: round2(itemsCost + travelCost + penalty),
  };
}

/** Menos productos sin cubrir primero; a igual cobertura, menor coste total. */
function compare(a: BasketPlan, b: BasketPlan): number {
  return a.missing.length - b.missing.length || a.score - b.score || a.storeIds.length - b.storeIds.length;
}

/**
 * Calcula la cesta óptima por búsqueda exhaustiva sobre subconjuntos de supermercados.
 * Con ~10 súper y maxStores ≤ 3 son ≤ 175 subconjuntos × N productos: instantáneo en el móvil,
 * y a diferencia de un voraz garantiza el óptimo incluyendo el coste de desplazamiento.
 */
export function optimizeBasket(
  items: ShoppingListItem[],
  stores: Store[],
  prices: PricePoint[],
  options: Partial<OptimizerOptions> = {},
): OptimizationResult | null {
  if (items.length === 0 || stores.length === 0) return null;
  // Ignora claves `undefined` para que no pisen los valores por defecto (darían NaN).
  const defined = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
  const opts: OptimizerOptions = { ...DEFAULT_OPTIONS, ...defined };
  const index = buildPriceIndex(prices);

  const plans = new Map<string, BasketPlan>();
  const maxK = Math.min(Math.max(1, opts.maxStores), stores.length);
  for (let k = 1; k <= maxK; k++) {
    for (const subset of combinations(stores, k)) {
      const plan = evaluate(subset, items, index, opts);
      if (plan.storeIds.length === 0) continue;
      const key = plan.storeIds.slice().sort().join('+');
      const prev = plans.get(key);
      if (!prev || compare(plan, prev) < 0) plans.set(key, plan);
    }
  }

  const sorted = [...plans.values()].sort(compare);
  if (sorted.length === 0) return null;
  const singles = sorted.filter((p) => p.storeIds.length === 1);
  const best = sorted[0];
  const bestSingle = singles[0] ?? best;
  const sameCoverage = singles.filter((p) => p.missing.length === bestSingle.missing.length);
  const worstSingle = sameCoverage.reduce((w, p) => (p.itemsCost > w.itemsCost ? p : w), bestSingle);

  return {
    best,
    bestSingle,
    alternatives: sorted.slice(1, 6),
    savingsVsSingle: round2(Math.max(0, bestSingle.itemsCost - best.itemsCost)),
    savingsVsWorst: round2(Math.max(0, worstSingle.itemsCost - best.itemsCost)),
  };
}
