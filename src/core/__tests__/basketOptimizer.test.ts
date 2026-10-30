import { describe, expect, it } from 'vitest';
import { optimizeBasket } from '../basketOptimizer';
import { matchProduct, normalizeName } from '../normalize';
import type { PricePoint, Product, Store } from '../types';

const stores: Store[] = [
  { id: 'a', name: 'A', color: '#000', distanceKm: 1 },
  { id: 'b', name: 'B', color: '#000', distanceKm: 1 },
  { id: 'c', name: 'C', color: '#000', distanceKm: 8 },
];

const p = (productId: string, storeId: string, price: number, observedAt = '2026-10-01'): PricePoint => ({
  productId,
  storeId,
  price,
  observedAt,
  samples: 3,
});

describe('optimizeBasket', () => {
  it('elige un único súper cuando dividir no compensa la penalización', () => {
    const prices = [p('leche', 'a', 1.0), p('leche', 'b', 0.95), p('pan', 'a', 1.0), p('pan', 'b', 1.05)];
    const r = optimizeBasket([{ productId: 'leche', quantity: 1 }, { productId: 'pan', quantity: 1 }], stores, prices)!;
    expect(r.best.storeIds).toHaveLength(1);
  });

  it('divide la compra cuando el ahorro supera la penalización', () => {
    const prices = [p('aceite', 'a', 9.0), p('aceite', 'b', 6.0), p('carne', 'a', 5.0), p('carne', 'b', 9.0)];
    const r = optimizeBasket([{ productId: 'aceite', quantity: 1 }, { productId: 'carne', quantity: 1 }], stores, prices)!;
    expect(r.best.storeIds.sort()).toEqual(['a', 'b']);
    expect(r.best.itemsCost).toBe(11);
    expect(r.bestSingle.itemsCost).toBe(14);
    expect(r.savingsVsSingle).toBe(3);
  });

  it('tiene en cuenta la distancia', () => {
    // C es más barato en productos pero está a 8 km: 8*2*0.15 = 2.4 € de desplazamiento.
    const prices = [p('x', 'a', 5.0), p('x', 'c', 4.0)];
    const r = optimizeBasket([{ productId: 'x', quantity: 1 }], stores, prices)!;
    expect(r.best.storeIds).toEqual(['a']);
    const ignoringDistance = optimizeBasket([{ productId: 'x', quantity: 1 }], stores, prices, { costPerKm: 0 })!;
    expect(ignoringDistance.best.storeIds).toEqual(['c']);
  });

  it('usa los valores por defecto cuando una opción llega como undefined', () => {
    const prices = [p('x', 'a', 5.0), p('x', 'c', 4.0)];
    const r = optimizeBasket([{ productId: 'x', quantity: 1 }], stores, prices, { costPerKm: undefined })!;
    expect(r.best.storeIds).toEqual(['a']);
    expect(Number.isNaN(r.best.score)).toBe(false);
  });

  it('prioriza cubrir toda la lista y usa el precio más reciente', () => {
    const prices = [p('x', 'a', 1), p('y', 'b', 1), p('x', 'b', 3, '2026-01-01'), p('x', 'b', 1.2, '2026-10-20')];
    const r = optimizeBasket([{ productId: 'x', quantity: 2 }, { productId: 'y', quantity: 1 }], stores, prices, { maxStores: 1 })!;
    expect(r.best.storeIds).toEqual(['b']);
    expect(r.best.missing).toEqual([]);
    expect(r.best.itemsCost).toBe(3.4);
  });
});

describe('normalización y emparejamiento', () => {
  const catalog: Product[] = [
    { id: 'leche-entera', name: 'Leche entera 1L', category: 'lacteos', aliases: [] },
    { id: 'yogur-natural', name: 'Yogur natural', category: 'lacteos', aliases: [] },
  ];

  it('expande abreviaturas y quita marcas blancas', () => {
    expect(normalizeName('LECH. ENT. HACENDADO')).toBe('leche entera');
  });

  it('empareja nombres de ticket con el catálogo tolerando erratas', () => {
    expect(matchProduct('LECHE ENTERA HACEND', catalog)?.product.id).toBe('leche-entera');
    expect(matchProduct('YOG NATRAL', catalog)?.product.id).toBe('yogur-natural');
    expect(matchProduct('DETERGENTE', catalog)).toBeNull();
  });
});
