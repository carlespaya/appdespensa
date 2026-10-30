// Modelo de dominio compartido por la app, el backend y los tests.

export type Category =
  | 'frescos'
  | 'lacteos'
  | 'carne_pescado'
  | 'despensa'
  | 'bebidas'
  | 'limpieza'
  | 'higiene'
  | 'congelados'
  | 'panaderia'
  | 'otros';

export interface Store {
  id: string;
  name: string;
  /** Color de marca para chips y gráficos. */
  color: string;
  /** Distancia al usuario en km (si hay ubicación). */
  distanceKm?: number;
}

export interface ReceiptLine {
  id: string;
  rawName: string;
  /** Id del producto canónico tras el emparejamiento (null si no se pudo emparejar). */
  productId: string | null;
  quantity: number;
  /** Para productos a peso, `quantity` está en kg y `unitPrice` en €/kg. */
  unit: 'ud' | 'kg';
  unitPrice: number;
  total: number;
  category: Category;
  /** Confianza 0..1 de la lectura OCR de esta línea; < 0.7 se resalta para revisión. */
  confidence: number;
}

export interface Receipt {
  id: string;
  storeId: string;
  /** ISO 8601 (yyyy-mm-dd). */
  date: string;
  lines: ReceiptLine[];
  total: number;
  imageUri?: string;
  createdAt: string;
  syncedAt?: string;
}

export interface ParsedReceipt {
  storeId: string | null;
  storeName: string | null;
  date: string | null;
  lines: Omit<ReceiptLine, 'id' | 'productId' | 'category'>[];
  total: number | null;
  /** true si la suma de líneas no cuadra con el total impreso. */
  totalMismatch: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: Category;
  /** Variantes de nombre vistas en tickets (ya normalizadas). */
  aliases: string[];
}

/** Último precio conocido de un producto en un supermercado (precio comunitario por zona). */
export interface PricePoint {
  productId: string;
  storeId: string;
  price: number;
  observedAt: string;
  /** Nº de observaciones de la comunidad que respaldan el precio. */
  samples: number;
}

export interface ShoppingListItem {
  productId: string;
  quantity: number;
}
