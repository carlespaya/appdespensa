import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { categorize } from '@/core/categorize';
import { matchProduct, normalizeName } from '@/core/normalize';
import type { ParsedReceipt, PricePoint, Product, Receipt, ShoppingListItem, Store } from '@/core/types';
import { catalog, demoReceipts, prices as seedPrices, stores as seedStores } from '@/data/seed';

// Persistencia local: SQLite (clave-valor) en nativo, localStorage en web.
function storage(): StateStorage {
  if (Platform.OS === 'web') return globalThis.localStorage;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-sqlite/kv-store').default;
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const today = () => new Date().toISOString().slice(0, 10);

export interface Settings {
  maxStores: number;
  useLocation: boolean;
  extraStorePenalty: number;
}

interface AppState {
  stores: Store[];
  products: Product[];
  prices: PricePoint[];
  receipts: Receipt[];
  shoppingList: ShoppingListItem[];
  settings: Settings;
  /** Ticket recién escaneado pendiente de revisión manual. */
  draft: Receipt | null;

  setDraftFromParsed: (parsed: ParsedReceipt, imageUri?: string) => void;
  updateDraft: (draft: Receipt) => void;
  commitDraft: () => string | null;
  deleteReceipt: (id: string) => void;
  /** Asigna manualmente una línea a un producto y aprende el alias para futuros tickets. */
  learnAlias: (rawName: string, productId: string) => void;

  setListQuantity: (productId: string, quantity: number) => void;
  clearList: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
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
      settings: { maxStores: 2, useLocation: true, extraStorePenalty: 1.5 },
      draft: null,

      setDraftFromParsed: (parsed, imageUri) => {
        const { products } = get();
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
            storeId: parsed.storeId ?? '',
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
        const { draft, receipts, prices } = get();
        if (!draft || !draft.storeId) return null;
        // Cada ticket confirmado aporta observaciones de precio (se suben a la comunidad al sincronizar).
        const observed: PricePoint[] = draft.lines
          .filter((l) => l.productId)
          .map((l) => ({ productId: l.productId!, storeId: draft.storeId, price: l.unitPrice, observedAt: draft.date, samples: 1 }));
        set({
          receipts: [draft, ...receipts].sort((a, b) => b.date.localeCompare(a.date)),
          prices: [...prices, ...observed],
          draft: null,
        });
        return draft.id;
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

      setListQuantity: (productId, quantity) => {
        const list = get().shoppingList.filter((i) => i.productId !== productId);
        set({ shoppingList: quantity > 0 ? [...list, { productId, quantity }] : list });
      },
      clearList: () => set({ shoppingList: [] }),
      updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
    }),
    {
      name: 'despensa-v1',
      storage: createJSONStorage(storage),
      partialize: (s) => ({
        receipts: s.receipts,
        products: s.products,
        prices: s.prices,
        shoppingList: s.shoppingList,
        settings: s.settings,
      }),
    },
  ),
);

export const storeById = (stores: Store[], id: string) => stores.find((s) => s.id === id);
export const productById = (products: Product[], id: string) => products.find((p) => p.id === id);
