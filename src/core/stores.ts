// Identificación del supermercado a partir de la cabecera del ticket.
// Cadenas conocidas por patrón; si no hay coincidencia se extrae el nombre comercial de la cabecera
// para que la app cree la tienda automáticamente.

export interface KnownChain {
  id: string;
  name: string;
  color: string;
  pattern: RegExp;
  /** Variantes del nombre en OpenStreetMap (brand/name) para calcular distancias. */
  osm?: RegExp;
}

export const KNOWN_CHAINS: KnownChain[] = [
  { id: 'mercadona', name: 'Mercadona', color: '#22C55E', pattern: /m[e3]rcad[o0]na/i },
  { id: 'lidl', name: 'Lidl', color: '#FACC15', pattern: /\bl[i1]dl\b/i },
  { id: 'carrefour', name: 'Carrefour', color: '#3B82F6', pattern: /carref[o0]ur/i },
  { id: 'dia', name: 'Dia', color: '#EF4444', pattern: /\bdia\s*(retail|%|s\.?a\.?u?\b)|supermercados\s+dia|\bdia\s+espa[ñn]a|\bdia\.es\b/i, osm: /^dia\b|^%?dia%?$/i },
  { id: 'aldi', name: 'Aldi', color: '#38BDF8', pattern: /\bald[i1]\b/i },
  { id: 'alcampo', name: 'Alcampo', color: '#F472B6', pattern: /alcampo|auchan/i },
  { id: 'eroski', name: 'Eroski', color: '#DC2626', pattern: /er[o0]ski/i },
  { id: 'consum', name: 'Consum', color: '#F97316', pattern: /c[o0]nsum\b|charter/i, osm: /consum|charter/i },
  { id: 'bonpreu', name: 'Bonpreu', color: '#E11D48', pattern: /b[o0]npreu|esclat/i },
  { id: 'caprabo', name: 'Caprabo', color: '#B91C1C', pattern: /caprab[o0]/i },
  { id: 'condis', name: 'Condis', color: '#16A34A', pattern: /c[o0]ndis\b/i },
  { id: 'hipercor', name: 'Hipercor', color: '#15803D', pattern: /hipercor/i },
  { id: 'elcorteingles', name: 'El Corte Inglés', color: '#166534', pattern: /corte\s+ingl[eé]s|supercor/i },
  { id: 'ahorramas', name: 'Ahorramas', color: '#0EA5E9', pattern: /ahorram[aá]s/i },
  { id: 'gadis', name: 'Gadis', color: '#2563EB', pattern: /\bgadis\b/i },
  { id: 'froiz', name: 'Froiz', color: '#9333EA', pattern: /\bfr[o0]iz\b/i },
  { id: 'bm', name: 'BM Supermercados', color: '#65A30D', pattern: /\bbm\s+supermercados|uvesco/i, osm: /^bm\b/i },
  { id: 'masymas', name: 'Masymas', color: '#CA8A04', pattern: /mas\s*y\s*mas|masymas/i },
  { id: 'spar', name: 'Spar', color: '#DC2626', pattern: /\bspar\b/i },
  { id: 'coviran', name: 'Covirán', color: '#0891B2', pattern: /covir[aá]n/i },
  { id: 'lupa', name: 'Lupa', color: '#DB2777', pattern: /\blupa\b|semark/i },
  { id: 'family-cash', name: 'Family Cash', color: '#7C3AED', pattern: /family\s*cash/i },
  { id: 'plusfresc', name: 'Plusfresc', color: '#84CC16', pattern: /plusfresc/i },
  { id: 'hiperdino', name: 'HiperDino', color: '#F59E0B', pattern: /hiper\s*dino|dinosol/i },
  { id: 'eleclerc', name: 'E.Leclerc', color: '#1D4ED8', pattern: /leclerc/i },
  { id: 'simply', name: 'Simply', color: '#10B981', pattern: /\bsimply\b|sabeco/i },
];

const PALETTE = ['#F97316', '#A855F7', '#06B6D4', '#EAB308', '#EC4899', '#14B8A6', '#8B5CF6', '#F43F5E'];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Color estable derivado del nombre, para tiendas creadas automáticamente. */
export function colorFor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const LEGAL = /\b(s\.?\s?a\.?\s?u?\.?|s\.?\s?l\.?\s?u?\.?|s\.?\s?coop\.?(\s?v\.?)?|sociedad\s+(an[oó]nima|limitada|cooperativa)|cooperativa)\b/gi;
const NOT_A_NAME =
  /(\d|\bc\/|calle|avda|avenida|\bav\.|carretera|ctra|pol[ií]gono|\bp\.?\s?i\.?\b|\bcp\b|\b\d{5}\b|tel[eé]?f?|tfno|n\.?i\.?f|c\.?i\.?f|www\.|http|@|factura|ticket|fecha|hora|caja|cajer|op:|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|bienvenid|gracias|horario|abierto)/i;

/** Busca el nombre comercial en las primeras líneas: la primera que parezca un nombre, sin dirección, fecha ni NIF. */
function extractUnknownName(header: string[]): string | null {
  for (const raw of header) {
    const line = raw.replace(/\t/g, ' ').trim();
    if (NOT_A_NAME.test(line)) continue;
    const name = line
      .replace(LEGAL, '')
      .replace(/\b[a-z]-?\d{7,8}\b/gi, '') // CIF
      .replace(/[^a-záéíóúñü&' .-]/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s.,-]+|[\s.,-]+$/g, '')
      .trim();
    const letters = name.replace(/[^a-záéíóúñü]/gi, '');
    if (letters.length >= 3 && letters.length <= 30 && name.split(' ').length <= 4) {
      return name
        .toLowerCase()
        .split(' ')
        .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
        .join(' ')
        .replace(/^./, (c) => c.toUpperCase());
    }
  }
  return null;
}

/** Asocia un local de OpenStreetMap (etiquetas brand/name/operator) a una cadena conocida. */
export function chainForOsm(tags: Record<string, string>): KnownChain | undefined {
  const label = [tags.brand, tags.name, tags.operator].filter(Boolean).join(' | ');
  return KNOWN_CHAINS.find((c) => (c.osm ?? c.pattern).test(label));
}

export interface DetectedStore {
  id: string;
  name: string;
  color: string;
  /** false si no es una cadena conocida y se ha deducido de la cabecera. */
  known: boolean;
}

export function detectStore(lines: string[]): DetectedStore | null {
  const header = lines.slice(0, 12);
  const headerText = header.join('\n');
  const chain = KNOWN_CHAINS.find((c) => c.pattern.test(headerText)) ?? KNOWN_CHAINS.find((c) => c.pattern.test(lines.join('\n')));
  if (chain) return { id: chain.id, name: chain.name, color: chain.color, known: true };
  const name = extractUnknownName(header.slice(0, 6));
  if (!name) return null;
  return { id: slugify(name), name, color: colorFor(name), known: false };
}
