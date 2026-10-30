import type { Product } from './types';

// Abreviaturas habituales en tickets españoles → forma completa.
const ABBREVIATIONS: Record<string, string> = {
  lech: 'leche',
  ent: 'entera',
  desn: 'desnatada',
  semi: 'semidesnatada',
  semid: 'semidesnatada',
  yog: 'yogur',
  nat: 'natural',
  pech: 'pechuga',
  pll: 'pollo',
  tom: 'tomate',
  trit: 'triturado',
  ac: 'aceite',
  acte: 'aceite',
  oliv: 'oliva',
  vir: 'virgen',
  ext: 'extra',
  pan: 'pan',
  mold: 'molde',
  detg: 'detergente',
  pap: 'papel',
  hig: 'higienico',
};

// Marcas blancas y ruido que no aportan para comparar entre supermercados.
const STOPWORDS = new Set([
  'hacendado', 'hacend', 'deliplus', 'bosque', 'verde', 'carrefour', 'dia', 'lidl', 'milbona',
  'auchan', 'eroski', 'consum', 'aldi', 'de', 'del', 'la', 'el', 'en', 'con', 'sin', 'pack', 'x',
]);

/** Pasa a minúsculas, quita tildes y símbolos, expande abreviaturas y descarta ruido. */
export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ABBREVIATIONS[t] ?? t)
    .filter((t) => !STOPWORDS.has(t))
    .join(' ');
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  const compact = s.replace(/\s+/g, ' ');
  for (let i = 0; i < compact.length - 1; i++) {
    const bg = compact.slice(i, i + 2);
    out.set(bg, (out.get(bg) ?? 0) + 1);
  }
  return out;
}

/** Coeficiente de Sørensen–Dice sobre bigramas de caracteres (0..1). Robusto a erratas del OCR. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  for (const [bg, n] of A) inter += Math.min(n, B.get(bg) ?? 0);
  return (2 * inter) / (a.length - 1 + (b.length - 1));
}

export interface ProductMatch {
  product: Product;
  score: number;
}

/**
 * Busca el producto canónico más parecido a una línea de ticket.
 * Devuelve null por debajo del umbral: la línea queda pendiente de que el usuario la asigne
 * (y su elección se guarda como alias para la próxima vez).
 */
export function matchProduct(rawName: string, catalog: Product[], threshold = 0.6): ProductMatch | null {
  const n = normalizeName(rawName);
  let best: ProductMatch | null = null;
  for (const product of catalog) {
    const candidates = [normalizeName(product.name), ...product.aliases];
    for (const c of candidates) {
      const score = similarity(n, c);
      if (!best || score > best.score) best = { product, score };
    }
  }
  return best && best.score >= threshold ? best : null;
}
