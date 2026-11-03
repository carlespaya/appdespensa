import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CompareBar, PriceLine } from '@/components/Charts';
import { GlassCard, SectionHeader } from '@/components/Glass';
import { Screen } from '@/components/Screen';
import { buildPriceIndex } from '@/core/basketOptimizer';
import { normalizeName } from '@/core/normalize';
import { suggestDuplicates } from '@/core/products';
import { priceHistory } from '@/core/stats';
import { activeStores, storeById, useAppStore } from '@/store/useAppStore';
import { colors, euro, radius, space, type } from '@/theme/tokens';

export default function Compare() {
  const { products, prices, stores: allStores, receipts, settings, dismissedPairs } = useAppStore();
  const pendingMerges = useMemo(() => suggestDuplicates(products, new Set(dismissedPairs)).length, [products, dismissedPairs]);
  const stores = useMemo(() => activeStores(allStores, settings), [allStores, settings]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(products[0]?.id);
  const index = useMemo(() => buildPriceIndex(prices), [prices]);
  const [since] = useState(() => new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10));

  // Cesta habitual: productos comprados en los últimos 90 días. Solo entran en la comparativa los súper
  // con precio para al menos el 60 % de ellos (una tienda recién creada con 3 precios no la vacía).
  const habitual = useMemo(() => {
    const qty = new Map<string, number>();
    for (const r of receipts.filter((r) => r.date >= since))
      for (const l of r.lines) if (l.productId) qty.set(l.productId, (qty.get(l.productId) ?? 0) + l.quantity);
    const ids = [...qty.keys()];
    const comparable = stores.filter((s) => ids.filter((id) => index.get(id)?.has(s.id)).length >= ids.length * 0.6);
    const common = ids.filter((id) => comparable.every((s) => index.get(id)?.has(s.id)));
    return comparable
      .map((s) => ({ store: s, cost: common.reduce((a, id) => a + index.get(id)!.get(s.id)! * qty.get(id)!, 0) }))
      .sort((a, b) => a.cost - b.cost)
      .map((x) => ({ ...x, count: common.length }));
  }, [receipts, stores, index, since]);

  const results = useMemo(() => {
    const q = normalizeName(query);
    return q ? products.filter((p) => normalizeName(p.name).includes(q)) : products;
  }, [query, products]);

  const product = products.find((p) => p.id === selected);
  const byStore = [...(index.get(selected ?? '')?.entries() ?? [])].sort((a, b) => a[1] - b[1]);
  const history = useMemo(() => (selected ? priceHistory(receipts, selected) : []), [receipts, selected]);
  const maxHabitual = habitual[habitual.length - 1]?.cost ?? 1;

  return (
    <Screen
      subtitle="Precios de la comunidad"
      title="Comparar"
      right={
        <Pressable onPress={() => router.push('/productos')} style={styles.productsBtn} accessibilityLabel="Mis productos">
          <Ionicons name="pricetags-outline" size={18} color={colors.text} />
          {pendingMerges > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{pendingMerges}</Text></View>}
        </Pressable>
      }
    >
      {pendingMerges > 0 && (
        <Pressable onPress={() => router.push('/productos')} style={{ marginBottom: space.md }}>
          <GlassCard>
            <View style={styles.inline}>
              <Ionicons name="git-merge-outline" size={22} color={colors.mint} />
              <View style={{ flex: 1 }}>
                <Text style={type.subtitle}>
                  {pendingMerges === 1 ? '1 producto podría ser el mismo' : `${pendingMerges} productos podrían ser el mismo`}
                </Text>
                <Text style={type.caption}>Únelos para comparar sus precios entre supermercados</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </View>
          </GlassCard>
        </Pressable>
      )}
      {habitual.length > 0 && habitual[0].count > 0 && (
        <GlassCard strong>
          <Text style={type.overline}>Tu cesta habitual · {habitual[0].count} productos · 90 días</Text>
          <Text style={[type.title, { marginVertical: space.sm }]}>
            {habitual[0].store.name} te ahorraría {euro(maxHabitual - habitual[0].cost)}
          </Text>
          {habitual.map((h, i) => (
            <CompareBar key={h.store.id} label={h.store.name} value={h.cost} max={maxHabitual} color={h.store.color} highlight={i === 0} />
          ))}
        </GlassCard>
      )}

      <SectionHeader title="Buscar producto" />
      <GlassCard padded={false}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Leche, aceite, café…" placeholderTextColor={colors.textFaint} style={[type.body, { flex: 1 }]} />
        </View>
        <View style={styles.results}>
          {results.slice(0, 8).map((p) => (
            <Pressable key={p.id} onPress={() => setSelected(p.id)} style={[styles.result, p.id === selected && styles.resultActive]}>
              <Text style={[type.caption, p.id === selected && { color: colors.text }]} numberOfLines={1}>{p.name}</Text>
            </Pressable>
          ))}
        </View>
      </GlassCard>

      {product && (
        <>
          <SectionHeader title={product.name} action="Ver ficha" onAction={() => router.push({ pathname: '/producto/[id]', params: { id: product.id } })} />
          <GlassCard>
            {byStore.map(([storeId, price], i) => {
              const s = storeById(stores, storeId);
              const diff = i > 0 ? ` (+${(((price - byStore[0][1]) / byStore[0][1]) * 100).toFixed(0)}%)` : '';
              return (
                <CompareBar
                  key={storeId}
                  label={`${s?.name ?? storeId}${diff}`}
                  value={price}
                  max={byStore[byStore.length - 1][1]}
                  color={s?.color ?? colors.blue}
                  highlight={i === 0}
                  note={undefined}
                />
              );
            })}
            {byStore.length === 0 && <Text style={type.caption}>Aún no hay precios para este producto en tu zona.</Text>}
          </GlassCard>

          {history.length >= 2 && (
            <GlassCard style={{ marginTop: space.md }}>
              <Text style={type.overline}>Lo que has pagado</Text>
              <Text style={[type.caption, { marginBottom: space.md }]}>
                De {euro(history[0].price)} a {euro(history[history.length - 1].price)} en {history.length} compras
              </Text>
              <PriceLine points={history.map((h) => h.price)} />
            </GlassCard>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  productsBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.glassFillStrong, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: colors.onAccent, fontSize: 11, fontWeight: '800' },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: 14 },
  results: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, padding: space.md, paddingTop: 0 },
  result: { paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.glassFill },
  resultActive: { backgroundColor: 'rgba(61,139,255,0.25)' },
});
