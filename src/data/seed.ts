// Datos de demostración. En producción, `stores`, `catalog` y `prices` vienen de Supabase
// (precios comunitarios filtrados por zona) y se cachean localmente.
import { categorize } from '@/core/categorize';
import { normalizeName } from '@/core/normalize';
import type { PricePoint, Product, Receipt, Store } from '@/core/types';

export const stores: Store[] = [
  { id: 'mercadona', name: 'Mercadona', color: '#22C55E', distanceKm: 0.6 },
  { id: 'lidl', name: 'Lidl', color: '#FACC15', distanceKm: 1.4 },
  { id: 'carrefour', name: 'Carrefour', color: '#3B82F6', distanceKm: 2.1 },
  { id: 'dia', name: 'Dia', color: '#EF4444', distanceKm: 0.3 },
  { id: 'aldi', name: 'Aldi', color: '#38BDF8', distanceKm: 3.2 },
  { id: 'alcampo', name: 'Alcampo', color: '#F472B6', distanceKm: 4.5 },
];

// [id, nombre, precio base]; cada súper aplica su factor y una variación determinista.
const BASE: [string, string, number][] = [
  ['leche-entera', 'Leche entera 1L', 0.95],
  ['huevos-l-12', 'Huevos L 12 ud', 2.45],
  ['yogur-natural', 'Yogur natural 4 ud', 1.1],
  ['pan-molde', 'Pan de molde integral', 1.35],
  ['platano', 'Plátano (kg)', 1.89],
  ['tomate', 'Tomate (kg)', 2.2],
  ['pechuga-pollo', 'Pechuga de pollo (kg)', 6.5],
  ['aceite-oliva', 'Aceite de oliva virgen extra 1L', 7.9],
  ['arroz', 'Arroz redondo 1kg', 1.45],
  ['pasta', 'Macarrones 500g', 0.85],
  ['tomate-triturado', 'Tomate triturado 400g', 0.65],
  ['queso-lonchas', 'Queso en lonchas', 1.95],
  ['cafe', 'Café molido 250g', 3.2],
  ['agua-6', 'Agua mineral 6x1,5L', 1.8],
  ['cerveza-12', 'Cerveza 12 latas', 5.4],
  ['detergente', 'Detergente líquido 40 lavados', 6.9],
  ['papel-higienico', 'Papel higiénico 12 rollos', 4.2],
  ['champu', 'Champú 400ml', 1.9],
  ['salmon', 'Salmón fresco (kg)', 14.9],
  ['manzana', 'Manzana golden (kg)', 2.1],
];

const STORE_FACTOR: Record<string, number> = {
  mercadona: 1.0,
  lidl: 0.95,
  carrefour: 1.04,
  dia: 1.02,
  aldi: 0.94,
  alcampo: 0.98,
};

// Pseudoaleatorio determinista para que la demo sea estable entre recargas.
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

export const catalog: Product[] = BASE.map(([id, name]) => ({
  id,
  name,
  category: categorize(name),
  aliases: [normalizeName(name)],
}));

export const prices: PricePoint[] = BASE.flatMap(([id, , base]) =>
  stores
    // Algunos súper no tienen todos los productos (p. ej. salmón fresco en Aldi).
    .filter((s) => hash(id + s.id) > 0.08)
    .map((s) => ({
      productId: id,
      storeId: s.id,
      price: round2(base * STORE_FACTOR[s.id] * (0.88 + hash(s.id + id) * 0.24)),
      observedAt: '2026-10-25',
      samples: 3 + Math.floor(hash(id + s.id + 'n') * 40),
    })),
);

function priceOf(productId: string, storeId: string): number {
  return prices.find((p) => p.productId === productId && p.storeId === storeId)?.price ?? 1;
}

/** Seis meses de tickets de ejemplo para que historial y gráficos no aparezcan vacíos. */
export function demoReceipts(now = new Date()): Receipt[] {
  const out: Receipt[] = [];
  const usual = ['mercadona', 'lidl', 'mercadona', 'dia', 'carrefour'];
  for (let m = 5; m >= 0; m--) {
    for (let w = 0; w < 3; w++) {
      const day = 4 + w * 9;
      const d = new Date(now.getFullYear(), now.getMonth() - m, day);
      if (d > now) continue;
      const storeId = usual[(m + w) % usual.length];
      const picks = BASE.filter(([id]) => hash(id + m + w) > 0.55 && priceOf(id, storeId) !== 1);
      // Inflación suave: los meses antiguos eran un poco más baratos.
      const drift = 1 - m * 0.006;
      const lines = picks.map(([id, name], i) => {
        const quantity = name.includes('(kg)') ? round2(0.5 + hash(id + m) * 1.2) : 1 + Math.floor(hash(id + w) * 2);
        const unitPrice = round2(priceOf(id, storeId) * drift);
        return {
          id: `l${m}${w}${i}`,
          rawName: name.toUpperCase(),
          productId: id,
          quantity,
          unit: name.includes('(kg)') ? ('kg' as const) : ('ud' as const),
          unitPrice,
          total: round2(unitPrice * quantity),
          category: categorize(name),
          confidence: 1,
        };
      });
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({
        id: `demo-${m}-${w}`,
        storeId,
        date: iso,
        lines,
        total: round2(lines.reduce((a, l) => a + l.total, 0)),
        createdAt: d.toISOString(),
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
