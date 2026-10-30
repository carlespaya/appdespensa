import { normalizeName } from './normalize';
import type { Category } from './types';

const RULES: [Category, string[]][] = [
  ['lacteos', ['leche', 'yogur', 'queso', 'mantequilla', 'nata', 'kefir']],
  ['carne_pescado', ['pollo', 'pechuga', 'ternera', 'cerdo', 'lomo', 'jamon', 'salmon', 'merluza', 'atun', 'gamba']],
  ['higiene', ['champu', 'gel', 'pasta dientes', 'desodorante', 'papel higienico', 'compresa']],
  ['limpieza', ['detergente', 'lejia', 'suavizante', 'friegasuelos', 'lavavajillas', 'bayeta']],
  ['congelados', ['congelad', 'helado', 'pizza']],
  ['despensa', ['arroz', 'pasta', 'macarron', 'aceite', 'azucar', 'harina', 'legumbre', 'garbanzo', 'lenteja', 'triturado', 'galleta', 'cereal']],
  ['frescos', ['platano', 'manzana', 'tomate', 'lechuga', 'patata', 'cebolla', 'zanahoria', 'naranja', 'huevo', 'aguacate']],
  ['panaderia', ['pan', 'baguette', 'barra', 'croissant', 'molde']],
  ['bebidas', ['agua', 'cerveza', 'vino', 'refresco', 'cola', 'zumo', 'cafe']],
];

/** Clasificación por palabras clave. El usuario puede corregirla y la corrección se memoriza por producto. */
export function categorize(rawName: string): Category {
  const n = normalizeName(rawName);
  for (const [cat, keys] of RULES) {
    if (keys.some((k) => n.includes(k))) return cat;
  }
  return 'otros';
}

export const CATEGORY_LABEL: Record<Category, string> = {
  frescos: 'Frescos',
  lacteos: 'Lácteos',
  carne_pescado: 'Carne y pescado',
  despensa: 'Despensa',
  bebidas: 'Bebidas',
  limpieza: 'Limpieza',
  higiene: 'Higiene',
  congelados: 'Congelados',
  panaderia: 'Panadería',
  otros: 'Otros',
};
