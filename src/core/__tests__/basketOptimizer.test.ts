import { describe, expect, it } from 'vitest';
import { optimizeBasket } from '../basketOptimizer';
import { categorize } from '../categorize';
import { displayName, matchProduct, normalizeName } from '../normalize';
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

  it('expande abreviaturas, quita marcas blancas y tamaños', () => {
    expect(normalizeName('LECH. ENT. HACENDADO')).toBe('leche entera');
    expect(normalizeName('ACEITE OLIVA V.EXTRA 1L')).toBe('aceite oliva v extra');
    expect(normalizeName('AGUA MINERAL 6X1,5L')).toBe('agua mineral');
  });

  it('empareja nombres de ticket con el catálogo tolerando erratas', () => {
    expect(matchProduct('LECHE ENTERA HACEND', catalog)?.product.id).toBe('leche-entera');
    expect(matchProduct('YOG NATRAL', catalog)?.product.id).toBe('yogur-natural');
    expect(matchProduct('Leche entera 1L', catalog)?.product.id).toBe('leche-entera');
    expect(matchProduct('DETERGENTE', catalog)).toBeNull();
  });

  it('empareja el mismo producto con nombres de distintas cadenas', () => {
    const full: Product[] = [
      ...catalog,
      { id: 'aceite', name: 'Aceite de oliva virgen extra 1L', category: 'despensa', aliases: [] },
      { id: 'pan', name: 'Pan de molde integral', category: 'panaderia', aliases: [] },
      { id: 'tomate-trit', name: 'Tomate triturado 400g', category: 'despensa', aliases: [] },
    ];
    expect(matchProduct('ACEITE OLIVA V.EXTRA', full)?.product.id).toBe('aceite');
    expect(matchProduct('AC. OLIVA VIRG. EXTRA 1L', full)?.product.id).toBe('aceite');
    expect(matchProduct('PAN MOLDE INTEG.', full)?.product.id).toBe('pan');
    expect(matchProduct('Tomate triturado', full)?.product.id).toBe('tomate-trit');
  });

  it('entiende las abreviaturas reales de Consum', () => {
    expect(normalizeName('L.SEMI.S/L.CONSUM1L')).toBe('leche semidesnatada sin lactosa');
    expect(normalizeName('CAFE DESC.CONSUM250')).toBe('cafe descafeinado');
    expect(normalizeName('PAÑ.MENTOL CONSUM10')).toBe('panuelos mentol');
    expect(categorize('PAÑ.MENTOL CONSUM10')).toBe('higiene');
    expect(categorize('PAN BARRA')).toBe('panaderia');
    expect(categorize('HIG.COMPAC.CONSUM12')).toBe('higiene');
  });

  it('genera un nombre legible para productos nuevos', () => {
    expect(displayName('LECHE SEMI HACEND 1L')).toBe('Leche semidesnatada 1L');
    expect(displayName('GALLETAS MARIA 800G')).toBe('Galletas maria 800g');
  });

  it('no confunde variantes excluyentes', () => {
    expect(matchProduct('LECHE SEMI CARREFOUR 1L', catalog)).toBeNull();
    expect(matchProduct('YOGUR GRIEGO', catalog)).toBeNull();
  });
});
