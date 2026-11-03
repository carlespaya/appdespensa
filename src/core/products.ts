// Correlación de productos entre supermercados: el mismo producto se llama distinto en cada ticket
// ("L.SEMI.S/L.CONSUM1L" en Consum, "LECHE SEMI S/LACT HACEND" en Mercadona). Aquí viven las
// operaciones puras para unir productos y sugerir cuáles podrían ser el mismo.
import { nameSimilarity, normalizeName } from './normalize';
import type { PricePoint, Product, Receipt, ShoppingListItem } from './types';

export interface CatalogData {
  products: Product[];
  receipts: Receipt[];
  prices: PricePoint[];
  shoppingList: ShoppingListItem[];
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** Añade el nombre visto en un ticket a la ficha del producto (por supermercado) y como alias de emparejamiento. */
export function rememberName(product: Product, storeId: string, rawName: string): Product {
  const names = { ...(product.names ?? {}) };
  const clean = rawName.trim();
  if (clean && !(names[storeId] ?? []).includes(clean)) names[storeId] = [...(names[storeId] ?? []), clean];
  const alias = normalizeName(rawName);
  return { ...product, names, aliases: alias && !product.aliases.includes(alias) ? [...product.aliases, alias] : product.aliases };
}

/**
 * Une `fromId` dentro de `intoId`: nombres, alias, líneas de ticket, precios y lista de la compra
 * pasan a apuntar al producto destino, y el origen desaparece.
 */
export function mergeProducts(data: CatalogData, fromId: string, intoId: string): CatalogData {
  if (fromId === intoId) return data;
  const from = data.products.find((p) => p.id === fromId);
  const into = data.products.find((p) => p.id === intoId);
  if (!from || !into) return data;

  const names: Record<string, string[]> = { ...(into.names ?? {}) };
  for (const [store, list] of Object.entries(from.names ?? {})) names[store] = uniq([...(names[store] ?? []), ...list]);
  const merged: Product = { ...into, names, aliases: uniq([...into.aliases, ...from.aliases, normalizeName(from.name)].filter(Boolean)) };

  const qty = new Map<string, number>();
  for (const i of data.shoppingList) {
    const id = i.productId === fromId ? intoId : i.productId;
    qty.set(id, (qty.get(id) ?? 0) + i.quantity);
  }

  return {
    products: data.products.filter((p) => p.id !== fromId).map((p) => (p.id === intoId ? merged : p)),
    receipts: data.receipts.map((r) =>
      r.lines.some((l) => l.productId === fromId)
        ? { ...r, lines: r.lines.map((l) => (l.productId === fromId ? { ...l, productId: intoId, category: into.category } : l)) }
        : r,
    ),
    prices: data.prices.map((p) => (p.productId === fromId ? { ...p, productId: intoId } : p)),
    shoppingList: [...qty.entries()].map(([productId, quantity]) => ({ productId, quantity })),
  };
}

export interface DuplicateSuggestion {
  a: Product;
  b: Product;
  score: number;
}

export const pairKey = (a: string, b: string) => [a, b].sort().join('|');

function bestScore(a: Product, b: Product): number {
  // Se renormalizan los alias: los guardados con versiones anteriores de normalizeName quedan al día.
  const namesA = uniq([a.name, ...a.aliases].map(normalizeName)).filter(Boolean);
  const namesB = uniq([b.name, ...b.aliases].map(normalizeName)).filter(Boolean);
  let best = 0;
  for (const x of namesA) for (const y of namesB) best = Math.max(best, nameSimilarity(x, y));
  return best;
}

/**
 * Parejas de productos que probablemente son el mismo (nombres parecidos, sobre todo si vienen de
 * supermercados distintos). El usuario confirma o descarta; lo descartado no se vuelve a sugerir.
 */
export function suggestDuplicates(products: Product[], dismissed: Set<string>, limit = 6, minScore = 0.42): DuplicateSuggestion[] {
  const out: DuplicateSuggestion[] = [];
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const a = products[i];
      const b = products[j];
      if (dismissed.has(pairKey(a.id, b.id))) continue;
      // Tomate fresco y tomate triturado comparten palabra pero no categoría: no son el mismo.
      if (a.category !== b.category && a.category !== 'otros' && b.category !== 'otros') continue;
      const score = bestScore(a, b);
      if (score >= minScore) out.push({ a, b, score });
    }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}
