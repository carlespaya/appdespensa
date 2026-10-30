import { buildPriceIndex } from './basketOptimizer';
import type { Category, PricePoint, Receipt, Store } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface MonthTotal {
  month: string; // yyyy-mm
  total: number;
}

/** Gasto por mes de los últimos `months` meses (incluye meses a 0 para que el gráfico no tenga huecos). */
export function monthlySpending(receipts: Receipt[], months = 6, now = new Date()): MonthTotal[] {
  const out: MonthTotal[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const total = receipts.filter((r) => r.date.startsWith(month)).reduce((acc, r) => acc + r.total, 0);
    out.push({ month, total: round2(total) });
  }
  return out;
}

export function spendingByCategory(receipts: Receipt[]): { category: Category; total: number }[] {
  const acc = new Map<Category, number>();
  for (const r of receipts) for (const l of r.lines) acc.set(l.category, (acc.get(l.category) ?? 0) + l.total);
  return [...acc.entries()].map(([category, total]) => ({ category, total: round2(total) })).sort((a, b) => b.total - a.total);
}

export function spendingByStore(receipts: Receipt[]): { storeId: string; total: number }[] {
  const acc = new Map<string, number>();
  for (const r of receipts) acc.set(r.storeId, (acc.get(r.storeId) ?? 0) + r.total);
  return [...acc.entries()].map(([storeId, total]) => ({ storeId, total: round2(total) })).sort((a, b) => b.total - a.total);
}

/** Evolución del precio unitario pagado por un producto a lo largo del historial. */
export function priceHistory(receipts: Receipt[], productId: string): { date: string; storeId: string; price: number }[] {
  return receipts
    .flatMap((r) => r.lines.filter((l) => l.productId === productId).map((l) => ({ date: r.date, storeId: r.storeId, price: l.unitPrice })))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface StoreComparison {
  storeId: string;
  /** Coste de los productos que sí tienen precio en ese súper. */
  cost: number;
  /** Lo que se pagó realmente por esos mismos productos (para comparar en igualdad de condiciones). */
  paidForSame: number;
  covered: number;
  totalItems: number;
}

/**
 * "¿Cuánto me habría costado este ticket en otro súper?"
 * Solo compara productos emparejados con el catálogo y con precio en el súper destino.
 */
export function compareReceiptAcrossStores(receipt: Receipt, stores: Store[], prices: PricePoint[]): StoreComparison[] {
  const index = buildPriceIndex(prices);
  const matched = receipt.lines.filter((l) => l.productId);
  return stores
    .map((s) => {
      let cost = 0;
      let paidForSame = 0;
      let covered = 0;
      for (const l of matched) {
        const price = index.get(l.productId!)?.get(s.id);
        if (price === undefined) continue;
        cost += price * l.quantity;
        paidForSame += l.total;
        covered++;
      }
      return { storeId: s.id, cost: round2(cost), paidForSame: round2(paidForSame), covered, totalItems: matched.length };
    })
    .sort((a, b) => b.covered - a.covered || a.cost - b.cost);
}
