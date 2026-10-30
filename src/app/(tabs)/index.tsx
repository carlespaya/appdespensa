import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { MonthlyBars } from '@/components/Charts';
import { GlassCard, SectionHeader } from '@/components/Glass';
import { ReceiptRow } from '@/components/ReceiptRow';
import { Screen } from '@/components/Screen';
import { optimizeBasket } from '@/core/basketOptimizer';
import { monthlySpending } from '@/core/stats';
import { useAppStore } from '@/store/useAppStore';
import { colors, euro, space, type } from '@/theme/tokens';

export default function Home() {
  const { receipts, shoppingList, stores, prices, settings } = useAppStore();
  const months = useMemo(() => monthlySpending(receipts, 6), [receipts]);
  const current = months[months.length - 1].total;
  const previous = months[months.length - 2].total;
  const delta = previous ? ((current - previous) / previous) * 100 : 0;

  const plan = useMemo(
    () => optimizeBasket(shoppingList, stores, prices, { maxStores: settings.maxStores, costPerKm: settings.useLocation ? undefined : 0 }),
    [shoppingList, stores, prices, settings],
  );

  return (
    <Screen subtitle="Tu despensa" title="Hola 👋">
      <Animated.View entering={FadeInDown.duration(500)}>
        <GlassCard strong>
          <Text style={type.overline}>Gasto este mes</Text>
          <View style={styles.row}>
            <Text style={[type.display, type.number]}>{euro(current)}</Text>
            <View style={[styles.badge, { backgroundColor: delta > 0 ? 'rgba(255,107,122,0.15)' : 'rgba(61,245,176,0.15)' }]}>
              <Ionicons name={delta > 0 ? 'arrow-up' : 'arrow-down'} size={12} color={delta > 0 ? colors.danger : colors.mint} />
              <Text style={[type.caption, { color: delta > 0 ? colors.danger : colors.mint }]}>{Math.abs(delta).toFixed(0)}%</Text>
            </View>
          </View>
          <Text style={[type.caption, { marginBottom: space.lg }]}>vs. {euro(previous)} el mes pasado</Text>
          <MonthlyBars data={months} />
        </GlassCard>
      </Animated.View>

      {plan && (
        <Animated.View entering={FadeInDown.delay(120).duration(500)}>
          <Pressable onPress={() => router.navigate('/cesta')}>
            <GlassCard style={{ marginTop: space.lg }}>
              <View style={styles.row}>
                <View style={styles.iconWrap}>
                  <Ionicons name="sparkles" size={20} color={colors.mint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={type.subtitle}>
                    {plan.savingsVsWorst > 0 ? `Ahorra ${euro(plan.savingsVsWorst)} en tu próxima compra` : `Tu próxima compra: ${euro(plan.best.itemsCost)}`}
                  </Text>
                  <Text style={type.caption}>
                    {shoppingList.length} productos · mejor opción: {plan.best.storeIds.map((id) => stores.find((s) => s.id === id)?.name).join(' + ')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </View>
            </GlassCard>
          </Pressable>
        </Animated.View>
      )}

      <SectionHeader title="Últimos tickets" action="Ver todo" onAction={() => router.navigate('/historial')} />
      <Animated.View entering={FadeInDown.delay(220).duration(500)}>
        <GlassCard padded={false}>
          {receipts.slice(0, 4).map((r, i) => (
            <ReceiptRow key={r.id} receipt={r} divider={i > 0} />
          ))}
        </GlassCard>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(61,245,176,0.12)',
  },
});
