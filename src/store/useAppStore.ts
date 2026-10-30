import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { categorize } from '@/core/categorize';
import { displayName, matchProduct, normalizeName } from '@/core/normalize';
import { colorFor, slugify } from '@/core/stores';
import type { ParsedReceipt, PricePoint, Product, Receipt, ShoppingListItem, Store } from '@/core/types';
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

export interface Settings {
  userName: string;
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
  maxStores: 2,
  useLocation: true,
  extraStorePenalty: 1.5,
  onlyPreferred: false,
  ocrApiKey: '',
};

/** Ticket en revisión. `newStore` es la tienda detectada que aún no existe en la app. */
export interface Draft extends Receipt {
  newStore?: Store;
}

interface AppState {
  stores: Store[];
  products: Product[];
  prices: PricePoint[];
  receipts: Receipt[];
  shoppingList: ShoppingListItem[];
  settings: Settings;
  draft: Draft | null;

  setDraftFromParsed: (parsed: ParsedReceipt, imageUri?: string) => void;
  updateDraft: (draft: Draft) => void;
  /** Guarda el ticket: crea la tienda y los productos nuevos y registra los precios observados. */
  commitDraft: () => string | null;
  deleteReceipt: (id: string) => void;
  /** Asigna manualmente una línea a un producto y aprende el alias para futuros tickets. */
  learnAlias: (rawName: string, productId: string) => void;

  addStore: (name: string) => Store;
  updateStore: (id: string, patch: Partial<Store>) => void;
  /** Actualiza distancias con las cadenas encontradas cerca y añade las que falten. */
  applyNearby: (chains: NearbyChain[]) => void;

  setListQuantity: (productId: string, quantity: number) => void;
  clearList: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  clearDemoData: () => void;
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

      setDraftFromParsed: (parsed, imageUri) => {
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
        const { newStore, ...receiptData } = draft;
        const nextStores = newStore && draft.storeId === newStore.id && !stores.some((s) => s.id === newStore.id) ? [...stores, newStore] : stores;

        // Las líneas sin emparejar se convierten en productos nuevos: así entran en el historial
        // de precios y otros tickets (de esta u otra cadena) podrán emparejarse con ellos.
        const nextProducts = [...products];
        const lines = receiptData.lines.map((l) => {
          if (l.productId || !normalizeName(l.rawName)) return l;
          const name = displayName(l.rawName);
          const id = slugify(name) || uid();
          let product = nextProducts.find((p) => p.id === id);
          if (!product) {
            product = { id, name, category: l.category, aliases: [normalizeName(l.rawName)] };
            nextProducts.push(product);
          }
          return { ...l, productId: product.id };
        });
        const receipt: Receipt = { ...receiptData, lines };

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
