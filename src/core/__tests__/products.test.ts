import { describe, expect, it } from 'vitest';
import { mergeProducts, pairKey, rememberName, suggestDuplicates, type CatalogData } from '../products';
import type { Product } from '../types';

const consum: Product = { id: 'l-consum', name: 'Leche semidesnatada sin lactosa', category: 'lacteos', aliases: ['leche semidesnatada sin lactosa'], names: { consum: ['L.SEMI.S/L.CONSUM1L'] } };
const merca: Product = { id: 'l-merca', name: 'Leche semi sin lactosa', category: 'lacteos', aliases: ['leche semidesnatada sin lactosa'], names: { mercadona: ['LECHE SEMI S/LACT HACEND'] } };
const pan: Product = { id: 'pan', name: 'Pan de molde', category: 'panaderia', aliases: ['pan molde'] };
const entera: Product = { id: 'entera', name: 'Leche entera', category: 'lacteos', aliases: ['leche entera'] };

const data: CatalogData = {
  products: [consum, merca, pan],
  receipts: [
    { id: 'r1', storeId: 'mercadona', date: '2026-10-01', total: 1, createdAt: '', lines: [{ id: 'x', rawName: 'LECHE SEMI S/LACT HACEND', productId: 'l-merca', quantity: 1, unit: 'ud', unitPrice: 1, total: 1, category: 'lacteos', confidence: 1 }] },
  ],
  prices: [{ productId: 'l-merca', storeId: 'mercadona', price: 1, observedAt: '2026-10-01', samples: 1 }],
  shoppingList: [
    { productId: 'l-merca', quantity: 2 },
    { productId: 'l-consum', quantity: 1 },
  ],
};

describe('mergeProducts', () => {
  it('une nombres por supermercado, tickets, precios y lista de la compra', () => {
    const r = mergeProducts(data, 'l-merca', 'l-consum');
    expect(r.products.map((p) => p.id)).toEqual(['l-consum', 'pan']);
    expect(r.products[0].names).toEqual({ consum: ['L.SEMI.S/L.CONSUM1L'], mercadona: ['LECHE SEMI S/LACT HACEND'] });
    expect(r.receipts[0].lines[0].productId).toBe('l-consum');
    expect(r.prices[0].productId).toBe('l-consum');
    expect(r.shoppingList).toEqual([{ productId: 'l-consum', quantity: 3 }]);
  });
});

describe('suggestDuplicates', () => {
  it('sugiere productos que parecen el mismo y no mezcla variantes', () => {
    const s = suggestDuplicates([consum, merca, pan, entera], new Set());
    expect(s[0]).toMatchObject({ a: { id: 'l-consum' }, b: { id: 'l-merca' } });
    expect(s.some((x) => [x.a.id, x.b.id].includes('entera') && [x.a.id, x.b.id].includes('l-consum'))).toBe(false);
  });

  it('no sugiere productos que solo comparten la unidad ("(kg)")', () => {
    const platano: Product = { id: 'platano', name: 'Plátano (kg)', category: 'frescos', aliases: [] };
    const tomate: Product = { id: 'tomate', name: 'Tomate (kg)', category: 'frescos', aliases: [] };
    expect(suggestDuplicates([platano, tomate], new Set())).toEqual([]);
  });

  it('no sugiere productos de categorías distintas', () => {
    const fresco: Product = { id: 'tomate', name: 'Tomate (kg)', category: 'frescos', aliases: ['tomate'] };
    const trit: Product = { id: 'trit', name: 'Tomate triturado', category: 'despensa', aliases: ['tomate triturado'] };
    expect(suggestDuplicates([fresco, trit], new Set())).toEqual([]);
  });

  it('no vuelve a sugerir una pareja descartada', () => {
    expect(suggestDuplicates([consum, merca], new Set([pairKey('l-merca', 'l-consum')]))).toEqual([]);
  });
});

describe('rememberName', () => {
  it('guarda cómo se llama el producto en cada súper sin duplicar', () => {
    const once = rememberName(pan, 'lidl', 'Pan molde integral');
    const twice = rememberName(once, 'lidl', 'Pan molde integral');
    expect(twice.names).toEqual({ lidl: ['Pan molde integral'] });
    expect(twice.aliases).toContain('pan molde integral');
  });
});
