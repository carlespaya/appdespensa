import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Chip, GlassCard, SectionHeader } from '@/components/Glass';
import { Screen } from '@/components/Screen';
import { optimizeBasket } from '@/core/basketOptimizer';
import { normalizeName } from '@/core/normalize';
import { productById, storeById, useAppStore } from '@/store/useAppStore';
import { colors, euro, radius, space, type } from '@/theme/tokens';

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => onChange(value - 1)} hitSlop={6} style={styles.stepBtn}>
        <Ionicons name={value <= 1 ? 'trash-outline' : 'remove'} size={16} color={value <= 1 ? colors.danger : colors.text} />
      </Pressable>
      <Text style={[type.subtitle, type.number, { minWidth: 20, textAlign: 'center' }]}>{value}</Text>
      <Pressable onPress={() => onChange(value + 1)} hitSlop={6} style={styles.stepBtn}>
        <Ionicons name="add" size={16} color={colors.text} />
      </Pressable>
    </View>
  );
}

export default function Basket() {
  const { shoppingList, products, stores, prices, settings, setListQuantity, updateSettings } = useAppStore();
  const [query, setQuery] = useState('');

  const result = useMemo(
    () =>
      optimizeBasket(shoppingList, stores, prices, {
        maxStores: settings.maxStores,
        extraStorePenalty: settings.extraStorePenalty,
        costPerKm: settings.useLocation ? undefined : 0,
      }),
    [shoppingList, stores, prices, settings],
  );

  const suggestions = useMemo(() => {
    const q = normalizeName(query);
    if (!q) return [];
    return products.filter((p) => normalizeName(p.name).includes(q) && !shoppingList.some((i) => i.productId === p.id)).slice(0, 5);
  }, [query, products, shoppingList]);

  return (
    <Screen subtitle="Lista de la compra" title="Cesta óptima">
      <GlassCard padded={false}>
        <View style={styles.search}>
          <Ionicons name="add-circle" size={20} color={colors.mint} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Añadir producto…" placeholderTextColor={colors.textFaint} style={[type.body, { flex: 1 }]} />
        </View>
        {suggestions.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => {
              setListQuantity(p.id, 1);
              setQuery('');
            }}
            style={[styles.row, styles.divider]}
          >
            <Text style={[type.body, { flex: 1 }]}>{p.name}</Text>
            <Ionicons name="add" size={18} color={colors.mint} />
          </Pressable>
        ))}
        {shoppingList.map((item) => (
          <Animated.View key={item.productId} layout={LinearTransition} style={[styles.row, styles.divider]}>
            <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{productById(products, item.productId)?.name ?? item.productId}</Text>
            <Stepper value={item.quantity} onChange={(n) => setListQuantity(item.productId, n)} />
          </Animated.View>
        ))}
      </GlassCard>

      <SectionHeader title="Preferencias" />
      <GlassCard>
        <Text style={type.caption}>¿Cuántos supermercados quieres visitar como máximo?</Text>
        <View style={styles.segment}>
          {[1, 2, 3].map((n) => (
            <Chip key={n} label={n === 1 ? 'Solo uno' : `Hasta ${n}`} active={settings.maxStores === n} onPress={() => updateSettings({ maxStores: n })} />
          ))}
        </View>
        <View style={[styles.rowPlain, { marginTop: space.md }]}>
          <View style={{ flex: 1 }}>
            <Text style={type.body}>Tener en cuenta la distancia</Text>
            <Text style={type.caption}>Suma el coste del desplazamiento a cada súper</Text>
          </View>
          <Switch
            value={settings.useLocation}
            onValueChange={(useLocation) => updateSettings({ useLocation })}
            trackColor={{ true: colors.mintDeep, false: 'rgba(255,255,255,0.15)' }}
            thumbColor={colors.text}
          />
        </View>
      </GlassCard>

      {result && (
        <Animated.View entering={FadeIn.duration(400)} key={result.best.storeIds.join('+')}>
          <SectionHeader title="Dónde comprar" />
          <GlassCard strong>
            <Text style={type.overline}>Total estimado</Text>
            <Text style={[type.display, type.number, { color: colors.mint }]}>{euro(result.best.itemsCost)}</Text>
            <Text style={type.caption}>
              {result.savingsVsWorst > 0 ? `Ahorras ${euro(result.savingsVsWorst)} frente al súper más caro` : 'Ya estás en la opción más barata'}
              {result.best.storeIds.length > 1 && result.savingsVsSingle > 0 ? ` · ${euro(result.savingsVsSingle)} más que yendo solo a ${storeById(stores, result.bestSingle.storeIds[0])?.name}` : ''}
            </Text>
            {result.best.travelCost > 0 && <Text style={[type.caption, { marginTop: 2 }]}>Desplazamiento estimado: {euro(result.best.travelCost)}</Text>}

            {result.best.storeIds.map((sid) => {
              const s = storeById(stores, sid);
              const items = result.best.assignments.filter((a) => a.storeId === sid);
              return (
                <View key={sid} style={styles.storeBlock}>
                  <View style={styles.rowPlain}>
                    <View style={[styles.dot, { backgroundColor: s?.color }]} />
                    <Text style={[type.subtitle, { flex: 1 }]}>{s?.name}</Text>
                    {s?.distanceKm !== undefined && <Text style={type.caption}>{s.distanceKm.toLocaleString('es-ES')} km</Text>}
                    <Text style={[type.subtitle, type.number]}>{euro(items.reduce((a, x) => a + x.subtotal, 0))}</Text>
                  </View>
                  {items.map((a) => (
                    <View key={a.productId} style={styles.assign}>
                      <Text style={[type.caption, { flex: 1 }]} numberOfLines={1}>
                        {a.quantity} × {productById(products, a.productId)?.name}
                      </Text>
                      <Text style={[type.caption, type.number]}>{euro(a.subtotal)}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
            {result.best.missing.length > 0 && (
              <Text style={[type.caption, { color: colors.warning, marginTop: space.md }]}>
                Sin precio conocido: {result.best.missing.map((id) => productById(products, id)?.name).join(', ')}
              </Text>
            )}
          </GlassCard>

          {result.alternatives.length > 0 && (
            <>
              <SectionHeader title="Otras opciones" />
              <GlassCard padded={false}>
                {result.alternatives.slice(0, 4).map((p, i) => {
                  // Comparamos dinero real (productos + desplazamiento); la penalización por parada es solo un criterio.
                  const diff = p.itemsCost + p.travelCost - (result.best.itemsCost + result.best.travelCost);
                  return (
                    <View key={p.storeIds.join('+')} style={[styles.row, i > 0 && styles.divider]}>
                      <View style={{ flex: 1 }}>
                        <Text style={type.body}>{p.storeIds.map((id) => storeById(stores, id)?.name).join(' + ')}</Text>
                        {p.missing.length > 0 && <Text style={[type.caption, { color: colors.warning }]}>Faltan {p.missing.length} productos</Text>}
                      </View>
                      <Text style={[type.body, type.number]}>{euro(p.itemsCost)}</Text>
                      <Text style={[type.caption, type.number, { color: diff > 0 ? colors.danger : colors.mint, minWidth: 64, textAlign: 'right' }]}>
                        {diff > 0 ? '+' : '−'}
                        {euro(Math.abs(diff))}
                      </Text>
                    </View>
                  );
                })}
              </GlassCard>
            </>
          )}
        </Animated.View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
  rowPlain: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.glassFill, borderRadius: radius.pill, padding: 4 },
  stepBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glassFillStrong },
  segment: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  storeBlock: { marginTop: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
  dot: { width: 10, height: 10, borderRadius: 5 },
  assign: { flexDirection: 'row', paddingLeft: 18, marginTop: 6, gap: space.sm },
});
