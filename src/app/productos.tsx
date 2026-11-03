import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { GlassButton, GlassCard, SectionHeader } from '@/components/Glass';
import { Screen } from '@/components/Screen';
import { CATEGORY_LABEL } from '@/core/categorize';
import { normalizeName } from '@/core/normalize';
import { suggestDuplicates } from '@/core/products';
import type { Product, Store } from '@/core/types';
import { storeById, useAppStore } from '@/store/useAppStore';
import { colors, radius, space, type } from '@/theme/tokens';

/** Supermercados en los que se ha visto el producto (por nombre en ticket o por precio). */
function useStoresOf() {
  const { prices, stores } = useAppStore();
  return useMemo(() => {
    const byProduct = new Map<string, Set<string>>();
    for (const p of prices) {
      if (!byProduct.has(p.productId)) byProduct.set(p.productId, new Set());
      byProduct.get(p.productId)!.add(p.storeId);
    }
    return (product: Product): Store[] => {
      const ids = new Set([...(byProduct.get(product.id) ?? []), ...Object.keys(product.names ?? {})]);
      return [...ids].map((id) => storeById(stores, id)).filter((s): s is Store => !!s);
    };
  }, [prices, stores]);
}

function StoreDots({ stores }: { stores: Store[] }) {
  return (
    <View style={styles.dots}>
      {stores.slice(0, 6).map((s) => (
        <View key={s.id} style={[styles.dot, { backgroundColor: s.color }]} />
      ))}
    </View>
  );
}

/** Nombre del producto tal cual sale en los tickets de cada súper (para ver por qué podrían ser el mismo). */
function TicketNames({ product }: { product: Product }) {
  const stores = useAppStore((s) => s.stores);
  const entries = Object.entries(product.names ?? {});
  if (!entries.length) return null;
  return (
    <View style={{ marginTop: 4, gap: 2 }}>
      {entries.slice(0, 2).map(([storeId, names]) => (
        <Text key={storeId} style={type.caption} numberOfLines={1}>
          {storeById(stores, storeId)?.name ?? storeId}: «{names[0]}»
        </Text>
      ))}
    </View>
  );
}

export default function Products() {
  const { products, dismissedPairs, mergeProducts, dismissPair, undoMerge } = useAppStore();
  const storesOf = useStoresOf();
  const [query, setQuery] = useState('');
  const [justMerged, setJustMerged] = useState<string | null>(null);

  const suggestions = useMemo(() => suggestDuplicates(products, new Set(dismissedPairs)), [products, dismissedPairs]);
  const list = useMemo(() => {
    const q = normalizeName(query);
    return products
      .filter((p) => !q || normalizeName(p.name).includes(q) || p.aliases.some((a) => a.includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [products, query]);

  /** Se conserva el producto que más supermercados tiene, para no perder su nombre "bueno". */
  const merge = (a: Product, b: Product) => {
    const keepA = storesOf(a).length >= storesOf(b).length;
    mergeProducts(keepA ? b.id : a.id, keepA ? a.id : b.id);
    setJustMerged(keepA ? a.name : b.name);
  };

  return (
    <Screen
      subtitle="Mismo producto, distinto nombre"
      title="Productos"
      right={
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close} accessibilityLabel="Cerrar">
          <Ionicons name="close" size={20} color={colors.text} />
        </Pressable>
      }
    >
      <GlassCard>
        <View style={styles.inline}>
          <Ionicons name="git-merge-outline" size={22} color={colors.mint} />
          <Text style={[type.caption, { flex: 1, color: colors.text }]}>
            Cada supermercado llama distinto a lo mismo («L.SEMI.S/L» en Consum, «LECHE SEMI S/LACT» en Mercadona). Une los que sean iguales y
            podremos comparar sus precios entre supermercados.
          </Text>
        </View>
      </GlassCard>

      {justMerged && (
        <GlassCard style={{ marginTop: space.md }}>
          <View style={styles.inline}>
            <Ionicons name="checkmark-circle" size={20} color={colors.mint} />
            <Text style={[type.caption, { flex: 1, color: colors.text }]}>Unidos en «{justMerged}».</Text>
            <Pressable
              onPress={() => {
                undoMerge();
                setJustMerged(null);
              }}
              hitSlop={8}
            >
              <Text style={[type.subtitle, { color: colors.mint }]}>Deshacer</Text>
            </Pressable>
          </View>
        </GlassCard>
      )}

      {suggestions.length > 0 && (
        <>
          <SectionHeader title="¿Son el mismo producto?" />
          {suggestions.map(({ a, b }) => (
            <Animated.View key={`${a.id}|${b.id}`} entering={FadeInDown} exiting={FadeOut} layout={LinearTransition} style={{ marginBottom: space.md }}>
              <GlassCard>
                {[a, b].map((p, i) => (
                  <View key={p.id} style={[styles.pairRow, i > 0 && styles.pairDivider]}>
                    <View style={{ flex: 1 }}>
                      <Text style={type.subtitle}>{p.name}</Text>
                      <TicketNames product={p} />
                    </View>
                    <StoreDots stores={storesOf(p)} />
                  </View>
                ))}
                <View style={styles.pairActions}>
                  <GlassButton label="Sí, unir" onPress={() => merge(a, b)} style={{ flex: 1 }} icon={<Ionicons name="checkmark" size={18} color={colors.onAccent} />} />
                  <GlassButton label="No" variant="ghost" onPress={() => dismissPair(a.id, b.id)} style={{ flex: 1 }} />
                </View>
              </GlassCard>
            </Animated.View>
          ))}
        </>
      )}

      <SectionHeader title={`Todos (${products.length})`} />
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Buscar producto…" placeholderTextColor={colors.textFaint} style={[type.body, { flex: 1 }]} />
      </View>
      <GlassCard padded={false}>
        {list.map((p, i) => (
          <Pressable
            key={p.id}
            onPress={() => router.push({ pathname: '/producto/[id]', params: { id: p.id } })}
            style={({ pressed }) => [styles.row, i > 0 && styles.pairDivider, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={type.body}>{p.name}</Text>
              <Text style={type.caption}>{CATEGORY_LABEL[p.category]}</Text>
            </View>
            <StoreDots stores={storesOf(p)} />
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        ))}
        {list.length === 0 && <Text style={[type.caption, { padding: space.lg }]}>No hay productos con ese nombre.</Text>}
      </GlassCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.glassFillStrong, alignItems: 'center', justifyContent: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pairRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  pairDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
  pairActions: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.glassFill,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    marginBottom: space.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
});
