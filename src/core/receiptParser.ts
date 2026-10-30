import { detectStore } from './stores';
import type { ParsedReceipt } from './types';

type ParsedLine = ParsedReceipt['lines'][number];

const PRICE = /-?\d{1,4}[.,]\d{2}(?!\d)/g;
/** Metadatos del ticket que nunca son productos. */
const META =
  /(\biva\b|i\.v\.a|base\s*imp|\bcuota\b|tarjeta|entregad|\bcambio\b|efectivo|factura|n\.?i\.?f|c\.?i\.?f|\btelf?\b|tel[eé]fono|tfno|\bop[:.]|\bcaja\b|cajer|ticket|gracias|devoluci|descripci[oó]n|p\.?\s*unit|precio\s*(unit|€\/)|\bimporte\b\s*$|^\s*importe\b(?!\s*total)|subtotal|puntos|\bvisa\b|mastercard|maestro|contactless|autoriz|\baut\b|\barc\b|\baid\b|terminal|comercio|atendid|le atendi|vendedor|cliente|\bsocio|\bclub\b|saldo|lidl plus|mi dia|\bcopia\b|exento|\bn[ºo°]\s*(op|tienda|ticket|art)|art[ií]culos?\s*:|total\s*art|\buds?\.?\s*:|horario|www\.|http|@|\bc\/|calle|avda|avenida|^eur$|\b\d{5}\b(?!\s*[.,]\d)|pago\s|pagado|pendiente|bienvenid|cuenta|\bbanco\b|\bnc\b|\bsec\b|\bpan\s*:|\bseq\b)/i;
const TOTAL = /^\s*(importe\s+)?total\b(?!\s*(art|iva|ahorr|desc|dto|uds?|unid|product|l[ií]neas))/i;
// Solo al inicio de la línea: "CAFE DESC.CONSUM" es café descafeinado, no un descuento.
const DISCOUNT = /^\s*(dto\b|descuento|desc\.|promo|oferta|ahorro|cup[oó]n|rebaja|bonific|2[ªa]\s*ud|3x2\b|2x1\b|club\s*descuento)/i;
const WEIGHT = /(\d+[.,]\d{1,3})\s*kg\.?\s*(?:x|×|a|\*|@)?\s*(\d+[.,]\d{2})\s*(?:€|eur)?\s*\/\s*kg/i;
const WEIGHT_LOOSE = /(\d+[.,]\d{3})\s*kg/i;
const MULTIPLIER = /^\s*(\d{1,3})\s*(?:uds?\.?|un\.?|u\.?)?\s*(?:x|×|\*)\s*(\d+[.,]\d{2})(?!\d)/i;

const num = (s: string) => parseFloat(s.replace(',', '.'));
const round2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: number, b: number, tol = 0.03) => Math.abs(a - b) <= tol;

/**
 * Corrige errores típicos del OCR en importes: "O,95" → "0,95", "1 ,35" / "1, 35" → "1,35", "2,2O" → "2,20".
 * Solo toca tokens con forma de número para no estropear palabras.
 */
export function fixOcrNumbers(line: string): string {
  return line
    .replace(/\t+/g, '  ')
    .replace(/(\d)\s+([,.])\s*(\d{2})(?!\d)/g, '$1$2$3')
    .replace(/(\d)([,.])\s+(\d{2})(?![\d.,])/g, '$1$2$3')
    .replace(/(^|\s)(-?)([0-9OoIlS]{1,4})([.,])([0-9OoIlS]{2})(?=\s|€|$|[A-E]\b)/g, (m, pre, sign, a, sep, b) => {
      const digits = (a + b).replace(/[^0-9]/g, '').length;
      if (digits < 2) return m;
      const fix = (s: string) => s.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/S/g, '5');
      return `${pre}${sign}${fix(a)}${sep}${fix(b)}`;
    })
    .replace(/(\d)\s*€/g, '$1 €');
}

/** Quita fechas y horas para que "28.10.2026" o "12:29" nunca se lean como precios. */
export function stripDateTime(line: string): string {
  return line
    .replace(/\b\d{1,2}\s?[/.-]\s?\d{1,2}\s?[/.-]\s?\d{2,4}\b/g, ' ')
    .replace(/\b20\d{2}[/.-]\d{1,2}[/.-]\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ');
}

const COLUMN_WORDS = /\b(cant|cantidad|uds?|unid|art[ií]culos?|descripci[oó]n|producto|pvp|precio|p\.?\s?unit|importe|euros?|eur|€)\b/gi;

/** Línea de títulos de columna: al menos dos palabras de columna y ningún importe. */
function isColumnHeader(line: string): boolean {
  if (/\d[.,]\d{2}/.test(line)) return false;
  const words = new Set((line.match(COLUMN_WORDS) ?? []).map((w) => w.toLowerCase()));
  return words.size >= 2;
}

function detectDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  const dmy = text.match(/\b(\d{1,2})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d{2,4})\b/);
  let y: string, mo: string, d: string;
  if (iso) [, y, mo, d] = iso;
  else if (dmy) {
    [, d, mo, y] = dmy;
    if (y.length === 2) y = `20${y}`;
  } else return null;
  const day = Number(d);
  const month = Number(mo);
  if (month < 1 || month > 12 || day < 1 || day > 31 || y.length !== 4) return null;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Penaliza nombres con caracteres típicos de mala lectura OCR. */
function nameConfidence(name: string): number {
  const letters = name.replace(/[^a-záéíóúñü]/gi, '').length;
  if (letters < 3) return 0.4;
  const noise = (name.match(/[|_~^<>{}[\]\\#=]/g) ?? []).length;
  const mixed = (name.match(/[a-z][0-9][a-z]/gi) ?? []).length;
  return Math.max(0.3, 1 - noise * 0.2 - mixed * 0.15);
}

function cleanName(s: string): string {
  return s
    .replace(PRICE, ' ')
    .replace(/€|\beur\b|\beuros?\b/gi, ' ')
    .replace(/^\s*\d{5,14}\s+/, '') // código EAN / interno al inicio
    .replace(/\s+\d{5,14}\s*$/, '')
    .replace(/[*#|_~^<>{}[\]\\=]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s.,:;-]+|[\s.,:;-]+$/g, '')
    .trim();
}

const hasName = (s: string) => /[a-záéíóúñü]{2,}/i.test(s);

/**
 * Deduce cantidad, precio unitario e importe a partir de los números de una línea.
 * Acepta "QTY NOMBRE P.UNIT IMPORTE", "NOMBRE QTY P.UNIT IMPORTE", "NOMBRE IMPORTE", etc.
 * Si la cantidad no está impresa pero hay dos precios con importe = n × unitario, infiere n.
 */
function interpretNumbers(qtyHint: number | null, prices: number[]) {
  const total = prices[prices.length - 1];
  if (prices.length >= 2) {
    const unit = prices[prices.length - 2];
    if (qtyHint && near(unit * qtyHint, total)) return { quantity: qtyHint, unitPrice: unit, total, consistent: true };
    if (near(unit, total)) return { quantity: qtyHint && qtyHint > 1 ? qtyHint : 1, unitPrice: unit, total, consistent: !qtyHint || qtyHint === 1 };
    for (let n = 2; n <= 24; n++) if (unit > 0 && near(unit * n, total)) return { quantity: n, unitPrice: unit, total, consistent: true };
    return { quantity: qtyHint ?? 1, unitPrice: qtyHint ? round2(total / qtyHint) : unit, total, consistent: false };
  }
  const quantity = qtyHint ?? 1;
  return { quantity, unitPrice: round2(total / quantity), total, consistent: true };
}

/**
 * Convierte el texto plano devuelto por el OCR en un ticket estructurado.
 * Soporta los formatos habituales en España (Mercadona, Lidl, Carrefour, Dia, Consum, Aldi, Eroski…):
 * cantidad al inicio o en columna, productos a peso, multiplicadores "2 x 0,99" antes o después del
 * producto, descuentos en negativo, códigos EAN, nombres en dos líneas y todo lo posterior al TOTAL.
 */
export function parseReceipt(text: string): ParsedReceipt {
  // El motor 3 de OCR.space devuelve Markdown: se quitan los "#" de encabezado.
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .filter(Boolean);
  const store = detectStore(rawLines);
  const date = detectDate(rawLines.map(fixOcrNumbers).join('\n'));
  const lines = rawLines.map((l) => stripDateTime(fixOcrNumbers(l)));
  // Si el ticket tiene cabecera de columnas ("CANT ARTICULO PVP EUROS"), los productos empiezan justo después.
  const totalIndex = lines.findIndex((l) => TOTAL.test(l));
  const headerIndex = lines.findIndex((l, i) => isColumnHeader(l) && (totalIndex < 0 || i < totalIndex));

  const items: ParsedLine[] = [];
  let total: number | null = null;
  let awaitingTotal = false;
  let inFooter = false;
  /** Nombre sin precio que espera una línea de peso, multiplicador o precio suelto. */
  let pending: { name: string; qty: number | null; age: number } | null = null;
  let pendingMult: { qty: number; unitPrice: number } | null = null;
  const storeNameRx = store ? new RegExp(store.name.split(' ')[0], 'i') : null;

  const push = (line: ParsedLine) => {
    if (line.total <= 0 || line.total > 999) return;
    items.push(line);
  };

  for (const [i, line] of lines.entries()) {
    // Todo lo anterior a la cabecera de columnas es cabecera del ticket (logo, eslogan, dirección…).
    if (i <= headerIndex) continue;
    /** Zona de cabecera sin marcador de columnas: aún no ha aparecido ningún producto. */
    const inHeader = headerIndex < 0 && items.length === 0;
    if (pending) pending.age++;
    if (pending && pending.age > 2) pending = null;

    // ── Total y pie del ticket ──
    if (TOTAL.test(line)) {
      const prices = line.match(PRICE);
      if (prices) {
        total = Math.abs(num(prices[prices.length - 1]));
        awaitingTotal = false;
      } else awaitingTotal = true;
      inFooter = true;
      pending = null;
      continue;
    }
    if (awaitingTotal) {
      const prices = line.match(PRICE);
      if (prices && !hasName(line.replace(/eur|€/gi, ''))) {
        total = Math.abs(num(prices[prices.length - 1]));
        awaitingTotal = false;
        continue;
      }
    }
    if (inFooter) continue;

    const prices = (line.match(PRICE) ?? []).map(num);
    const prev = items[items.length - 1];

    // ── Descuentos: restan del producto anterior ──
    if (prices.length && prev && (DISCOUNT.test(line) || prices[prices.length - 1] < 0) && !WEIGHT.test(line)) {
      const discount = Math.abs(prices[prices.length - 1]);
      if (discount < prev.total) {
        prev.total = round2(prev.total - discount);
        prev.unitPrice = round2(prev.total / prev.quantity);
      }
      continue;
    }

    // ── Línea de peso: "1,234 kg x 1,89 €/kg 2,33" ──
    const weight = line.match(WEIGHT);
    if (weight) {
      const kg = num(weight[1]);
      const perKg = num(weight[2]);
      const after = line.slice((weight.index ?? 0) + weight[0].length).match(PRICE);
      const lineTotal = after ? num(after[after.length - 1]) : round2(kg * perKg);
      const nameInLine = cleanName(line.slice(0, weight.index).replace(/^\s*\d{1,3}\s+(?=\D)/, ''));
      if (pending || hasName(nameInLine)) {
        const name = hasName(nameInLine) ? nameInLine : pending!.name;
        push({ rawName: name, quantity: kg, unit: 'kg', unitPrice: perKg, total: lineTotal, confidence: Math.min(nameConfidence(name), near(kg * perKg, lineTotal) ? 1 : 0.6) });
        pending = null;
      } else if (prev && (near(prev.total, lineTotal) || near(prev.total, kg * perKg))) {
        // El peso viene debajo de un producto que ya tenía importe (estilo Lidl).
        Object.assign(prev, { quantity: kg, unit: 'kg', unitPrice: perKg });
      }
      continue;
    }

    // ── Multiplicador: "3 x 0,65 1,95" ──
    const mult = line.match(MULTIPLIER);
    if (mult && !hasName(line.replace(MULTIPLIER, '').replace(/eur|€|uds?|un\b/gi, ''))) {
      const qty = Number(mult[1]);
      const unitPrice = num(mult[2]);
      const lineTotal = prices.length >= 2 ? prices[prices.length - 1] : round2(qty * unitPrice);
      if (pending) {
        push({ rawName: pending.name, quantity: qty, unit: 'ud', unitPrice, total: lineTotal, confidence: Math.min(nameConfidence(pending.name), near(qty * unitPrice, lineTotal) ? 1 : 0.6) });
        pending = null;
      } else if (prev && near(prev.total, qty * unitPrice)) {
        Object.assign(prev, { quantity: qty, unitPrice });
      } else {
        // Estilo Carrefour: el multiplicador va antes del producto al que se refiere.
        pendingMult = { qty, unitPrice };
      }
      continue;
    }

    if (META.test(line)) continue;
    if (storeNameRx && storeNameRx.test(line) && items.length === 0 && !prices.length) continue;

    // Quita la letra de tipo de IVA final (A/B/C) y marcas como "*".
    const clean = line.replace(/\s+[A-E]\s*\*?\s*$/, '').replace(/\s+\*\s*$/, '');
    // Cantidad de 1–2 cifras: un "157 -" al inicio es el código de tienda, no una cantidad.
    const leadQty = clean.match(/^\s*(\d{1,2})\s*(?:x|uds?\.?|u\.?)?\s+(?=[^\d\s-])/i);
    const rest = leadQty ? clean.slice(leadQty[0].length) : clean;
    // Cantidad en columna entre nombre y precios: "LECHE ENTERA   2   0,95   1,90"
    const colQty = !leadQty ? rest.match(/\s(\d{1,2})\s+-?\d{1,4}[.,]\d{2}(?!\d)/) : null;
    const qtyHint = leadQty ? Number(leadQty[1]) : colQty ? Number(colQty[1]) : null;
    const name = cleanName(colQty ? rest.replace(colQty[0], ' ') : rest);

    if (!prices.length) {
      if (!hasName(name)) continue;
      // En la cabecera solo cuenta como posible producto una línea con cantidad o en mayúsculas sin cifras
      // (descarta eslóganes, direcciones y teléfonos como "Juntos es cooperativa" o "157 - V. Cardenal…").
      if (inHeader && !leadQty && (/\d/.test(name) || name !== name.toUpperCase())) {
        pending = null;
        continue;
      }
      // Nombre sin precio: producto a peso/multiplicador, o primera mitad de un nombre largo.
      if (pending && pending.age <= 1 && name.length < 28) pending = { name: `${pending.name} ${name}`, qty: pending.qty ?? qtyHint, age: 0 };
      else pending = { name, qty: qtyHint, age: 0 };
      continue;
    }

    if (!hasName(name)) {
      // Precio suelto: completa el nombre pendiente de la línea anterior.
      if (pending) {
        const r = interpretNumbers(pending.qty, prices);
        push({ rawName: pending.name, quantity: r.quantity, unit: 'ud', unitPrice: r.unitPrice, total: r.total, confidence: Math.min(nameConfidence(pending.name), r.consistent ? 0.9 : 0.5) });
        pending = null;
      }
      continue;
    }

    // Un nombre sin precio justo encima es la primera mitad de este nombre ("TOMATE TRITURADO" / "EXTRA FINO 0,69").
    const joined = pending && pending.age === 1 ? `${pending.name} ${name}` : name;
    const looseKg = line.match(WEIGHT_LOOSE);
    const r = interpretNumbers(qtyHint ?? (joined !== name ? pending!.qty : null), prices);
    if (pendingMult && near(pendingMult.qty * pendingMult.unitPrice, r.total)) {
      r.quantity = pendingMult.qty;
      r.unitPrice = pendingMult.unitPrice;
      r.consistent = true;
    }
    push({
      rawName: joined,
      quantity: looseKg ? num(looseKg[1]) : r.quantity,
      unit: looseKg ? 'kg' : 'ud',
      unitPrice: looseKg ? round2(r.total / num(looseKg[1])) : r.unitPrice,
      total: r.total,
      confidence: Math.min(nameConfidence(joined), r.consistent ? 1 : 0.5),
    });
    pending = null;
    pendingMult = null;
  }

  // Última defensa: si la suma no cuadra con el total impreso y quitar una única línea dudosa
  // (de las primeras, o de baja confianza) lo cuadra exactamente, esa línea no era un producto.
  if (total !== null && items.length > 1) {
    const s = items.reduce((acc, l) => acc + l.total, 0);
    if (Math.abs(total - s) > 0.05) {
      const bad = items.findIndex((l, idx) => (idx < 2 || l.confidence < 0.7) && near(s - l.total, total!, 0.02));
      if (bad >= 0) items.splice(bad, 1);
    }
  }

  const sum = round2(items.reduce((acc, l) => acc + l.total, 0));
  return {
    storeId: store?.id ?? null,
    storeName: store?.name ?? null,
    storeColor: store?.color ?? null,
    storeKnown: store?.known ?? false,
    date,
    lines: items,
    total: total ?? (items.length ? sum : null),
    totalMismatch: total !== null && Math.abs(total - sum) > 0.05,
  };
}
