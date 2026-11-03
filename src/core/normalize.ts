import type { Product } from './types';

// Abreviaturas habituales en tickets españoles → forma completa.
const ABBREVIATIONS: Record<string, string> = {
  lech: 'leche',
  lche: 'leche',
  ent: 'entera',
  desn: 'desnatada',
  desnat: 'desnatada',
  semi: 'semidesnatada',
  semid: 'semidesnatada',
  semidesn: 'semidesnatada',
  yog: 'yogur',
  yogurt: 'yogur',
  nat: 'natural',
  natu: 'natural',
  pech: 'pechuga',
  pll: 'pollo',
  pol: 'pollo',
  tom: 'tomate',
  trit: 'triturado',
  ac: 'aceite',
  acte: 'aceite',
  aceit: 'aceite',
  oliv: 'oliva',
  vir: 'virgen',
  virg: 'virgen',
  ext: 'extra',
  mold: 'molde',
  integ: 'integral',
  detg: 'detergente',
  deterg: 'detergente',
  pap: 'papel',
  hig: 'higienico',
  queso: 'queso',
  qso: 'queso',
  lonch: 'lonchas',
  cerv: 'cerveza',
  refr: 'refresco',
  zum: 'zumo',
  naranj: 'naranja',
  platan: 'platano',
  platanos: 'platano',
  manzanas: 'manzana',
  tomates: 'tomate',
  huevo: 'huevos',
  macarr: 'macarrones',
  espag: 'espaguetis',
  garb: 'garbanzos',
  lent: 'lentejas',
  champ: 'champu',
  suav: 'suavizante',
  lavav: 'lavavajillas',
  congel: 'congelado',
  fresc: 'fresco',
  salm: 'salmon',
  desc: 'descafeinado',
  descaf: 'descafeinado',
  rec: 'recambio',
  elec: 'electrico',
  compac: 'compacto',
  horch: 'horchata',
  garbanzo: 'garbanzos',
  verd: 'verduras',
  cer: 'cereales',
  cereal: 'cereales',
};

// Marcas blancas y ruido que no aportan para comparar entre supermercados.
const STOPWORDS = new Set([
  'hacendado', 'hacend', 'hacen', 'deliplus', 'bosque', 'verde', 'carrefour', 'dia', 'lidl', 'milbona', 'auchan',
  'alcampo', 'eroski', 'consum', 'aldi', 'milsani', 'bonpreu', 'condis', 'ifa', 'eliges', 'bm', 'classic', 'basic',
  'de', 'del', 'la', 'el', 'los', 'las', 'en', 'con', 'y', 'al', 'pack', 'x', 'p', 'u', 'ud', 'uds', 'unid', 'bot', 'botella', 'bric', 'brick', 'lata', 'bolsa', 'bandeja', 'band', 'tarrina', 'paq',
  // Unidades sin número ("Plátano (kg)"): no dicen nada del producto.
  'kg', 'g', 'gr', 'grs', 'l', 'lt', 'ml', 'cl', 'granel',
]);

/** Variantes que hacen que dos productos NO sean equivalentes aunque el resto del nombre coincida. */
const EXCLUSIVE_GROUPS = [
  ['entera', 'semidesnatada', 'desnatada', 'sin lactosa'],
  ['natural', 'griego', 'fresa', 'limon', 'macedonia', 'coco'],
  ['blanco', 'integral', 'centeno'],
  ['tinto', 'blanco', 'rosado'],
  ['normal', 'zero', 'light'],
];

/** Tamaños y unidades: "1L", "500g", "6x1,5l", "40d"… Se separan del nombre para comparar. */
const SIZE = /\b\d+([.,]\d+)?\s*(x\s*\d+([.,]\d+)?\s*)?(kg|g|gr|grs|l|lt|ml|cl|ud|uds|u|d|lav|lavados|rollos|r)\b/g;

/** Pasa a minúsculas, quita tildes, símbolos, tamaños y marcas, y expande abreviaturas. */
export function normalizeName(raw: string): string {
  const tokens = raw
    // Abreviaturas con barra o eñe que se perderían al quitar símbolos y tildes.
    .replace(/\bs\/\s?(l|lact|lactosa)\b\.?/gi, ' sin lactosa ')
    .replace(/\bs\/a\b/gi, ' sin alcohol ')
    .replace(/\bs\/g\b/gi, ' sin gluten ')
    .replace(/\bpa[ñÑ](?:uelos?)?(?![a-zñÑ])\.?/gi, ' panuelos ')
    // Marca pegada al tamaño: "CONSUM250" → "CONSUM 250", "CONSUM1L" → "CONSUM 1L".
    .replace(/([a-zñ])(\d)/gi, '$1 $2')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(SIZE, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  // "L.SEMI", "L.ENT": una "l" suelta al principio es leche.
  if (tokens[0] === 'l' && tokens.length > 1) tokens[0] = 'leche';
  return tokens
    .map((t) => ABBREVIATIONS[t] ?? t)
    .filter((t) => !STOPWORDS.has(t) && !/^\d+$/.test(t))
    .join(' ');
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2);
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

/** Parecido entre palabras: prefijo (abreviatura no listada, p. ej. "integ") o Dice alto (errata). */
function tokenScore(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.9;
  const s = similarity(a, b);
  return s >= 0.7 ? s : 0;
}

/**
 * Similitud por palabras (F1 difuso): cada palabra se empareja con la más parecida del otro nombre.
 * Penaliza mucho las variantes excluyentes (entera ≠ semidesnatada) para no mezclar productos distintos.
 */
export function nameSimilarity(a: string, b: string): number {
  const A = a.split(' ').filter(Boolean);
  const B = b.split(' ').filter(Boolean);
  if (!A.length || !B.length) return 0;
  const best = (t: string, pool: string[]) => Math.max(0, ...pool.map((p) => tokenScore(t, p)));
  const recallA = A.reduce((s, t) => s + best(t, B), 0) / A.length;
  const recallB = B.reduce((s, t) => s + best(t, A), 0) / B.length;
  let score = recallA + recallB > 0 ? (2 * recallA * recallB) / (recallA + recallB) : 0;
  score = 0.75 * score + 0.25 * similarity(a, b);
  for (const group of EXCLUSIVE_GROUPS) {
    const va = group.find((g) => ` ${a} `.includes(` ${g} `));
    const vb = group.find((g) => ` ${b} `.includes(` ${g} `));
    if (va && vb && va !== vb) score *= 0.4;
  }
  return score;
}

export interface ProductMatch {
  product: Product;
  score: number;
}

/** Productos ordenados por parecido a una línea de ticket (para sugerencias en la revisión). */
export function rankProducts(rawName: string, catalog: Product[]): ProductMatch[] {
  const n = normalizeName(rawName);
  return catalog
    .map((product) => ({
      product,
      // Los alias se renormalizan por si se guardaron con una versión anterior de las reglas.
      score: Math.max(nameSimilarity(n, normalizeName(product.name)), ...product.aliases.map((a) => normalizeName(a)).map((a) => (a === n ? 1 : nameSimilarity(n, a)))),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Busca el producto canónico más parecido a una línea de ticket.
 * Devuelve null por debajo del umbral: la app crea entonces un producto nuevo con ese nombre,
 * y si el usuario lo reasigna se guarda como alias para la próxima vez.
 */
export function matchProduct(rawName: string, catalog: Product[], threshold = 0.62): ProductMatch | null {
  if (!normalizeName(rawName)) return null;
  const best = rankProducts(rawName, catalog)[0];
  return best && best.score >= threshold ? best : null;
}

/** Nombre legible para un producto creado a partir de una línea de ticket ("LECHE SEMI HACEND 1L" → "Leche semidesnatada 1L"). */
export function displayName(rawName: string): string {
  const base = normalizeName(rawName);
  if (!base) return rawName.trim();
  const sizes = (rawName.toLowerCase().match(SIZE) ?? []).map((s) => s.replace(/\s+/g, '').replace(/lt$/, 'l').replace(/l$/, 'L'));
  return [base.charAt(0).toUpperCase() + base.slice(1), ...sizes].join(' ');
}
