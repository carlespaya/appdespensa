import type { ParsedReceipt } from './types';

type ParsedLine = ParsedReceipt['lines'][number];

/** Patrones de cabecera para identificar el supermercado. Se amplía desde backend sin publicar versión. */
export const STORE_PATTERNS: { id: string; name: string; pattern: RegExp }[] = [
  { id: 'mercadona', name: 'Mercadona', pattern: /mercadona/i },
  { id: 'lidl', name: 'Lidl', pattern: /\blidl\b/i },
  { id: 'carrefour', name: 'Carrefour', pattern: /carrefour/i },
  { id: 'dia', name: 'Dia', pattern: /\bdia\b.*(retail|%)|supermercados dia|\bdia s\.?a/i },
  { id: 'aldi', name: 'Aldi', pattern: /\baldi\b/i },
  { id: 'alcampo', name: 'Alcampo', pattern: /alcampo|auchan/i },
  { id: 'eroski', name: 'Eroski', pattern: /eroski/i },
  { id: 'consum', name: 'Consum', pattern: /consum/i },
];

const PRICE = /-?\d{1,4}[.,]\d{2}(?!\d)/g;
const IGNORE =
  /\b(iva|base imp|cuota|tarjeta|entregado|cambio|efectivo|factura|n\.?i\.?f|c\.?i\.?f|telf?|tel[eé]fono|op:|caja|ticket|gracias|devoluci|importe\s*$|descripci[oó]n|p\.?\s*unit|subtotal|ahorro|puntos|visa|mastercard|contactless|aut\.?)\b/i;
const TOTAL = /^\s*total\b(?!\s*art)/i;
const WEIGHT = /(\d+[.,]\d{1,3})\s*kg\s*(?:x\s*)?(\d+[.,]\d{2})\s*(?:€|eur)?\s*\/\s*kg/i;
const MULTIPLIER = /^\s*(\d{1,3})\s*[x×]\s*(\d+[.,]\d{2})/i;

const num = (s: string) => parseFloat(s.replace(',', '.'));
const round2 = (n: number) => Math.round(n * 100) / 100;

function detectStore(lines: string[]) {
  const header = lines.slice(0, 10).join('\n');
  return STORE_PATTERNS.find((s) => s.pattern.test(header)) ?? null;
}

function detectDate(text: string): string | null {
  const m = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const year = y.length === 2 ? `20${y}` : y;
  const day = Number(d);
  const month = Number(mo);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Penaliza nombres con caracteres típicos de mala lectura OCR. */
function nameConfidence(name: string): number {
  const letters = name.replace(/[^a-záéíóúñü]/gi, '').length;
  if (letters < 3) return 0.3;
  const noise = (name.match(/[|_~^<>{}[\]\\]/g) ?? []).length;
  const digitsInWords = (name.match(/[a-z]\d|\d[a-z]/gi) ?? []).length;
  return Math.max(0.3, 1 - noise * 0.2 - digitsInWords * 0.1);
}

/**
 * Convierte el texto plano devuelto por el OCR en un ticket estructurado.
 * Soporta los formatos más habituales en España: "QTY NOMBRE [P.UNIT] IMPORTE",
 * líneas de peso "1,234 kg x 1,89 €/kg 2,33" y multiplicadores "2 x 0,99" (estilo Lidl/Aldi).
 */
export function parseReceipt(text: string): ParsedReceipt {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const store = detectStore(lines);
  const date = detectDate(text);

  const items: ParsedLine[] = [];
  let total: number | null = null;
  /** Nombre sin precio esperando una línea de peso o multiplicador. */
  let pending: { name: string; qty: number } | null = null;

  for (const line of lines) {
    if (TOTAL.test(line)) {
      const prices = line.match(PRICE);
      if (prices) total = num(prices[prices.length - 1]);
      continue;
    }

    const weight = line.match(WEIGHT);
    if (weight) {
      const kg = num(weight[1]);
      const perKg = num(weight[2]);
      const prices = line.match(PRICE) ?? [];
      const target = pending;
      const lineTotal = prices.length >= 2 ? num(prices[prices.length - 1]) : round2(kg * perKg);
      if (target) {
        items.push({
          rawName: target.name,
          quantity: kg,
          unit: 'kg',
          unitPrice: perKg,
          total: lineTotal,
          confidence: Math.min(nameConfidence(target.name), Math.abs(kg * perKg - lineTotal) <= 0.02 ? 1 : 0.6),
        });
        pending = null;
      }
      continue;
    }

    const mult = line.match(MULTIPLIER);
    if (mult && pending) {
      const qty = Number(mult[1]);
      const unitPrice = num(mult[2]);
      const prices = line.match(PRICE) ?? [];
      const lineTotal = prices.length >= 2 ? num(prices[prices.length - 1]) : round2(qty * unitPrice);
      items.push({
        rawName: pending.name,
        quantity: qty,
        unit: 'ud',
        unitPrice,
        total: lineTotal,
        confidence: Math.min(nameConfidence(pending.name), Math.abs(qty * unitPrice - lineTotal) <= 0.02 ? 1 : 0.6),
      });
      pending = null;
      continue;
    }

    if (IGNORE.test(line)) continue;

    // Quita la letra de tipo de IVA final (A/B/C) que añaden Lidl, Aldi, etc.
    const clean = line.replace(/\s+[A-D]\s*$/, '');
    const prices = clean.match(PRICE) ?? [];
    const qtyMatch = clean.match(/^(\d{1,3})\s+(?=\D)/);
    const qty = qtyMatch ? Number(qtyMatch[1]) : 1;
    const name = clean
      .replace(/^(\d{1,3})\s+(?=\D)/, '')
      .replace(PRICE, '')
      .replace(/[€]|eur\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!/[a-záéíóúñ]{2,}/i.test(name)) continue;

    if (prices.length === 0) {
      // Puede ser el nombre de un producto a peso/multiplicador o una línea de cabecera.
      pending = items.length > 0 || store ? { name, qty } : null;
      if (detectStore([line])) pending = null;
      continue;
    }

    const lineTotal = num(prices[prices.length - 1]);
    const unitPrice = prices.length >= 2 ? num(prices[prices.length - 2]) : round2(lineTotal / qty);
    const consistent = Math.abs(unitPrice * qty - lineTotal) <= 0.02;
    items.push({
      rawName: name,
      quantity: qty,
      unit: 'ud',
      unitPrice,
      total: lineTotal,
      confidence: Math.min(nameConfidence(name), consistent ? 1 : 0.5),
    });
    pending = null;
  }

  const sum = round2(items.reduce((acc, l) => acc + l.total, 0));
  return {
    storeId: store?.id ?? null,
    storeName: store?.name ?? null,
    date,
    lines: items,
    total: total ?? (items.length ? sum : null),
    totalMismatch: total !== null && Math.abs(total - sum) > 0.05,
  };
}
