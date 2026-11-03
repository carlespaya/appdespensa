import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { CompareBar, PriceLine } from '@/components/Charts';
import { Chip, GlassButton, GlassCard, SectionHeader } from '@/components/Glass';
import { formatDate } from '@/components/ReceiptRow';
import { ProductPicker } from '@/components/ProductPicker';
import { Screen } from '@/components/Screen';
import { buildPriceIndex } from '@/core/basketOptimizer';
import { CATEGORY_LABEL } from '@/core/categorize';
import { priceHistory } from '@/core/stats';
import type { Category } from '@/core/types';
import { storeById, useAppStore } from '@/store/useAppStore';
import { colors, euro, space, type } from '@/theme/tokens';

/** Ficha de producto: sus nombres en cada súper, dónde es más barato y cómo ha cambiado su precio. */
export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { products, prices, stores, receipts, shoppingList, updateProduct, mergeProducts, undoMerge, setListQuantity } = useAppStore();
  const product = products.find((p) => p.id === id);
  const [merging, setMerging] = useState(false);
  const [merged, setMerged] = useState<string | null>(null);

  const byStore = useMemo(() => [...(buildPriceIndex(prices).get(id ?? '')?.entries() ?? [])].sort((a, b) => a[1] - b[1]), [prices, id]);
  const history = useMemo(() => (id ? priceHistory(receipts, id) : []), [receipts, id]);

  if (!product) {
    return (
      <Screen title="Producto">
        <Text style={type.body}>Este producto ya no existe (puede que se haya unido con otro).</Text>
        <GlassButton label="Volver" variant="ghost" onPress={() => router.back()} style={{ marginTop: space.lg }} />
      </Screen>
    );
  }

  const names = Object.entries(product.names ?? {});
  const inList = shoppingList.find((i) => i.productId === product.id)?.quantity ?? 0;

  return (
    <Screen
      subtitle={CATEGORY_LABEL[product.category]}
      title={product.name}
      right={
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close} accessibilityLabel="Volver">
          <Ionicons name="close" size={20} color={colors.text} />
        </Pressable>
      }
    >
      {merged && (
        <GlassCard style={{ marginBottom: space.md }}>
          <View style={styles.inline}>
            <Ionicons name="checkmark-circle" size={20} color={colors.mint} />
            <Text style={[type.caption, { flex: 1, color: colors.text }]}>Unido con «{merged}». Ahora sus precios se comparan juntos.</Text>
            <Pressable
              onPress={() => {
                undoMerge();
                setMerged(null);
              }}
              hitSlop={8}
            >
              <Text style={[type.subtitle, { color: colors.mint }]}>Deshacer</Text>
            </Pressable>
          </View>
        </GlassCard>
      )}

      <GlassButton
        label={inList ? `En tu lista (${inList}) · añadir otro` : 'Añadir a la lista de la compra'}
        variant={inList ? 'ghost' : 'mint'}
        icon={<Ionicons name="basket-outline" size={18} color={inList ? colors.text : colors.onAccent} />}
        onPress={() => setListQuantity(product.id, inList + 1)}
      />

      <SectionHeader title="Cómo se llama en cada supermercado" />
      <GlassCard>
        {names.length === 0 && <Text style={type.caption}>Todavía no lo has comprado. Aparecerá aquí al escanear un ticket.</Text>}
        {names.map(([storeId, list], i) => {
          const s = storeById(stores, storeId);
          return (
            <View key={storeId} style={[styles.nameRow, i > 0 && styles.divider]}>
              <View style={[styles.dot, { backgroundColor: s?.color ?? colors.blue }]} />
              <Text style={[type.body, { width: 96 }]} numberOfLines={1}>
                {s?.name ?? storeId}
              </Text>
              <Text style={[styles.mono, { flex: 1 }]}>{list.join('\n')}</Text>
            </View>
          );
        })}
        <Pressable onPress={() => setMerging(true)} style={[styles.inline, { marginTop: space.md }]}>
          <Ionicons name="git-merge-outline" size={18} color={colors.mint} />
          <Text style={[type.subtitle, { color: colors.mint }]}>¿Otro súper lo llama distinto? Únelo</Text>
        </Pressable>
      </GlassCard>

      <SectionHeader title="Dónde es más barato" />
      <GlassCard>
        {byStore.map(([storeId, price], i) => {
          const s = storeById(stores, storeId);
          return (
            <CompareBar
              key={storeId}
              label={s?.name ?? storeId}
              value={price}
              max={byStore[byStore.length - 1][1]}
              color={s?.color ?? colors.blue}
              highlight={i === 0}
              note={i === 0 && byStore.length > 1 ? `${euro(byStore[byStore.length - 1][1] - price)} más barato que el más caro` : undefined}
            />
          );
        })}
        {byStore.length === 0 && <Text style={type.caption}>Aún no hay precios de este producto.</Text>}
      </GlassCard>

      {history.length >= 2 && (
        <>
          <SectionHeader title="Lo que has pagado" />
          <GlassCard>
            <Text style={[type.caption, { marginBottom: space.md }]}>
              {euro(history[0].price)} el {formatDate(history[0].date)} → {euro(history[history.length - 1].price)} el {formatDate(history[history.length - 1].date)}
            </Text>
            <PriceLine points={history.map((h) => h.price)} />
          </GlassCard>
        </>
      )}

      <SectionHeader title="Editar" />
      <GlassCard>
        <Text style={type.overline}>Nombre</Text>
        <TextInput
          key={product.name}
          defaultValue={product.name}
          onEndEditing={(e) => e.nativeEvent.text.trim() && updateProduct(product.id, { name: e.nativeEvent.text.trim() })}
          style={[type.body, styles.field]}
        />
        <Text style={[type.overline, { marginTop: space.md }]}>Categoría</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingTop: space.sm }}>
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
            <Chip key={c} label={CATEGORY_LABEL[c]} active={product.category === c} onPress={() => updateProduct(product.id, { category: c })} />
          ))}
        </ScrollView>
      </GlassCard>

      <ProductPicker
        visible={merging}
        title="¿Con qué producto lo unimos?"
        rawName={product.name}
        products={products}
        excludeId={product.id}
        onPick={(other) => {
          mergeProducts(other.id, product.id);
          setMerged(other.name);
        }}
        onClose={() => setMerging(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.glassFillStrong, alignItems: 'center', justifyContent: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
  dot: { width: 10, height: 10, borderRadius: 5 },
  mono: { fontFamily: 'monospace', fontSize: 12, color: colors.textMuted },
  field: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingHorizontal: space.md, paddingVertical: 10, marginTop: space.sm },
});
