import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { categorize } from '@/core/categorize';
import { displayName, matchProduct, normalizeName } from '@/core/normalize';
import { mergeProducts, pairKey, rememberName, type CatalogData } from '@/core/products';
import { colorFor, slugify } from '@/core/stores';
import type { ParsedReceipt, PricePoint, Product, Receipt, ReceiptLine, ShoppingListItem, Store } from '@/core/types';
import { catalog, demoReceipts, prices as seedPrices, stores as seedStores } from '@/data/seed';
import type { NearbyChain } from '@/services/nearby';

// Persistencia local: SQLite (clave-valor) en nativo, localStorage en web.
function storage(): StateStorage {
  if (Platform.OS === 'web') return globalThis.localStorage;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-sqlite/kv-store').default;
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const today = () => new Date().toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface Settings {
  userName: string;
  /** La guía rápida de Inicio ya se ha cerrado. */
  onboardingDone: boolean;
  /** Límite de gasto mensual total (€). undefined = sin límite. */
  monthlyLimit?: number;
  maxStores: number;
  useLocation: boolean;
  extraStorePenalty: number;
  /** Calcular la cesta solo con los supermercados marcados como favoritos. */
  onlyPreferred: boolean;
  /** Clave gratuita de OCR.space; vacía = clave pública de demostración. */
  ocrApiKey: string;
}

const DEFAULT_SETTINGS: Settings = {
  userName: '',
  onboardingDone: false,
  maxStores: 2,
  useLocation: true,
  extraStorePenalty: 1.5,
  onlyPreferred: false,
  ocrApiKey: '',
};

/** Ticket en revisión. `newStore` es la tienda detectada que aún no existe en la app. */
export interface Draft extends Omit<Receipt, 'lines'> {
  newStore?: Store;
  lines: DraftLine[];
  /** Líneas del ticket con importe que no se entendieron: se pueden añadir con un toque. */
  unusedLines?: string[];
  /** Texto tal cual lo devolvió el OCR, para consultarlo desde la revisión. */
  ocrText?: string;
}

/** Línea en revisión: si no tiene producto, se creará uno nuevo con `newProductName` al guardar. */
export type DraftLine = ReceiptLine & {
  newProductName?: string;
  /** El usuario eligió el producto a mano: ya no se reempareja al editar el nombre. */
  manualMatch?: boolean;
};

interface AppState {
  stores: Store[];
  products: Product[];
  prices: PricePoint[];
  receipts: Receipt[];
  shoppingList: ShoppingListItem[];
  settings: Settings;
  draft: Draft | null;
  /** Parejas de productos que el usuario dijo que NO son el mismo (no se vuelven a sugerir). */
  dismissedPairs: string[];

  setDraftFromParsed: (parsed: ParsedReceipt, imageUri?: string, ocrText?: string) => void;
  updateDraft: (draft: Draft) => void;
  /** Guarda el ticket: crea la tienda y los productos nuevos y registra los precios observados. */
  commitDraft: () => string | null;
  deleteReceipt: (id: string) => void;
  /** Asigna manualmente una línea a un producto y aprende el alias para futuros tickets. */
  learnAlias: (rawName: string, productId: string) => void;
  /** Une dos productos que son el mismo (con nombres distintos en cada súper). */
  mergeProducts: (fromId: string, intoId: string) => void;
  /** Deshace la última unión de productos (si la hay). */
  undoMerge: () => void;
  lastMergeSnapshot: CatalogData | null;
  updateProduct: (id: string, patch: Partial<Pick<Product, 'name' | 'category'>>) => void;
  dismissPair: (a: string, b: string) => void;

  addStore: (name: string) => Store;
  updateStore: (id: string, patch: Partial<Store>) => void;
  /** Actualiza distancias con las cadenas encontradas cerca y añade las que falten. */
  applyNearby: (chains: NearbyChain[]) => void;

  setListQuantity: (productId: string, quantity: number) => void;
  clearList: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  clearDemoData: () => void;
  /** Borra todos los tickets y los precios aprendidos de ellos. Conserva tiendas, productos y ajustes. */
  clearHistory: () => void;
}

/** Supermercados que entran en la comparación y la cesta según las preferencias del usuario. */
export function activeStores(stores: Store[], settings: Settings): Store[] {
  const enabled = stores.filter((s) => s.enabled !== false);
  const preferred = enabled.filter((s) => s.preferred);
  return settings.onlyPreferred && preferred.length ? preferred : enabled;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      stores: seedStores,
      products: catalog,
      prices: seedPrices,
      receipts: demoReceipts(),
      shoppingList: [
        { productId: 'leche-entera', quantity: 6 },
        { productId: 'aceite-oliva', quantity: 1 },
        { productId: 'pechuga-pollo', quantity: 1 },
        { productId: 'detergente', quantity: 1 },
        { productId: 'cafe', quantity: 2 },
      ],
      settings: DEFAULT_SETTINGS,
      draft: null,
      dismissedPairs: [],

      setDraftFromParsed: (parsed, imageUri, ocrText) => {
        const { products, stores } = get();
        // Una tienda ya creada antes (p. ej. "Consum") puede venir con otro id si se creó a mano.
        const existing = parsed.storeId
          ? stores.find((s) => s.id === parsed.storeId || slugify(s.name) === slugify(parsed.storeName ?? ''))
          : undefined;
        const newStore: Store | undefined =
          !existing && parsed.storeId && parsed.storeName
            ? { id: parsed.storeId, name: parsed.storeName, color: parsed.storeColor ?? colorFor(parsed.storeName), enabled: true }
            : undefined;

        const lines = parsed.lines.map((l) => {
          const match = matchProduct(l.rawName, products);
          return {
            ...l,
            id: uid(),
            productId: match?.product.id ?? null,
            category: match?.product.category ?? categorize(l.rawName),
          };
        });
        set({
          draft: {
            id: uid(),
            storeId: existing?.id ?? newStore?.id ?? '',
            newStore,
            unusedLines: parsed.unusedLines,
            ocrText,
            date: parsed.date ?? today(),
            lines,
            total: parsed.total ?? 0,
            imageUri,
            createdAt: new Date().toISOString(),
          },
        });
      },

      updateDraft: (draft) => set({ draft }),

      commitDraft: () => {
        const { draft, receipts, prices, stores, products } = get();
        if (!draft || !draft.storeId) return null;
        const { newStore, unusedLines: _unused, ocrText: _ocr, ...receiptData } = draft;
        const nextStores = newStore && draft.storeId === newStore.id && !stores.some((s) => s.id === newStore.id) ? [...stores, newStore] : stores;

        // Las líneas sin emparejar se convierten en productos nuevos: así entran en el historial
        // de precios y otros tickets (de esta u otra cadena) podrán emparejarse con ellos.
        // Además se recuerda cómo se llama cada producto en este súper (ficha de producto y emparejamiento).
        const nextProducts = [...products];
        const upsert = (p: Product) => {
          const idx = nextProducts.findIndex((x) => x.id === p.id);
          if (idx >= 0) nextProducts[idx] = p;
          else nextProducts.push(p);
        };
        const lines = receiptData.lines
          .filter((l) => l.rawName.trim() && l.total > 0)
          .map(({ newProductName, manualMatch: _manual, ...l }) => {
            let product = l.productId ? nextProducts.find((p) => p.id === l.productId) : undefined;
            if (!product) {
              const name = newProductName?.trim() || displayName(l.rawName);
              const id = slugify(name) || uid();
              product = nextProducts.find((p) => p.id === id) ?? { id, name, category: l.category, aliases: [] };
            }
            upsert(rememberName(product, receiptData.storeId, l.rawName));
            return { ...l, productId: product.id, category: product.category };
          });
        const receipt: Receipt = { ...receiptData, lines, total: receiptData.total || round2(lines.reduce((a, l) => a + l.total, 0)) };

        // Cada ticket confirmado aporta observaciones de precio (se suben a la comunidad al sincronizar).
        const observed: PricePoint[] = lines
          .filter((l) => l.productId)
          .map((l) => ({ productId: l.productId!, storeId: receipt.storeId, price: l.unitPrice, observedAt: receipt.date, samples: 1 }));
        set({
          stores: nextStores,
          products: nextProducts,
          receipts: [receipt, ...receipts].sort((a, b) => b.date.localeCompare(a.date)),
          prices: [...prices, ...observed],
          draft: null,
        });
        return receipt.id;
      },

      deleteReceipt: (id) => set({ receipts: get().receipts.filter((r) => r.id !== id) }),

      learnAlias: (rawName, productId) =>
        set({
          products: get().products.map((p) =>
            p.id === productId && !p.aliases.includes(normalizeName(rawName))
              ? { ...p, aliases: [...p.aliases, normalizeName(rawName)] }
              : p,
          ),
        }),

      mergeProducts: (fromId, intoId) => {
        const { products, receipts, prices, shoppingList } = get();
        const before = { products, receipts, prices, shoppingList };
        set({ ...mergeProducts(before, fromId, intoId), lastMergeSnapshot: before });
      },

      undoMerge: () => {
        const snapshot = get().lastMergeSnapshot;
        if (snapshot) set({ ...snapshot, lastMergeSnapshot: null });
      },
      lastMergeSnapshot: null,

      updateProduct: (id, patch) => {
        const products = get().products.map((p) => (p.id === id ? { ...p, ...patch } : p));
        // Cambiar la categoría de un producto la cambia también en su historial.
        const receipts = patch.category
          ? get().receipts.map((r) => ({ ...r, lines: r.lines.map((l) => (l.productId === id ? { ...l, category: patch.category! } : l)) }))
          : get().receipts;
        set({ products, receipts });
      },

      dismissPair: (a, b) => set({ dismissedPairs: [...get().dismissedPairs, pairKey(a, b)] }),

      addStore: (name) => {
        const clean = name.trim();
        const id = slugify(clean) || uid();
        const existing = get().stores.find((s) => s.id === id);
        if (existing) return existing;
        const store: Store = { id, name: clean, color: colorFor(clean), enabled: true };
        set({ stores: [...get().stores, store] });
        return store;
      },

      updateStore: (id, patch) => set({ stores: get().stores.map((s) => (s.id === id ? { ...s, ...patch } : s)) }),

      applyNearby: (chains) => {
        const stores = get().stores.map((s) => {
          const found = chains.find((c) => c.id === s.id);
          return found ? { ...s, distanceKm: found.distanceKm } : s;
        });
        const added = chains
          .filter((c) => !stores.some((s) => s.id === c.id))
          .map((c) => ({ id: c.id, name: c.name, color: c.color, distanceKm: c.distanceKm, enabled: true }));
        set({ stores: [...stores, ...added] });
      },

      setListQuantity: (productId, quantity) => {
        const list = get().shoppingList.filter((i) => i.productId !== productId);
        set({ shoppingList: quantity > 0 ? [...list, { productId, quantity }] : list });
      },
      clearList: () => set({ shoppingList: [] }),
      updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
      clearDemoData: () => set({ receipts: get().receipts.filter((r) => !r.id.startsWith('demo-')) }),
      clearHistory: () => set({ receipts: [], prices: seedPrices, draft: null }),
    }),
    {
      name: 'despensa-v1',
      version: 2,
      storage: createJSONStorage(storage),
      partialize: (s) => ({
        stores: s.stores,
        receipts: s.receipts,
        products: s.products,
        prices: s.prices,
        shoppingList: s.shoppingList,
        settings: s.settings,
        dismissedPairs: s.dismissedPairs,
      }),
      // v1 no guardaba tiendas y tenía menos ajustes: se completan con los valores por defecto.
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<AppState>;
        return { ...state, stores: state.stores ?? seedStores, settings: { ...DEFAULT_SETTINGS, ...state.settings } } as AppState;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } };
      },
    },
  ),
);

export const storeById = (stores: Store[], id: string) => stores.find((s) => s.id === id);
export const productById = (products: Product[], id: string) => products.find((p) => p.id === id);
