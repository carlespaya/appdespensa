import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { MonthlyBars } from '@/components/Charts';
import { GlassButton, GlassCard, SectionHeader } from '@/components/Glass';
import { ReceiptRow } from '@/components/ReceiptRow';
import { Screen } from '@/components/Screen';
import { optimizeBasket } from '@/core/basketOptimizer';
import { monthlySpending, spendingByStore } from '@/core/stats';
import { activeStores, useAppStore } from '@/store/useAppStore';
import { colors, euro, space, type } from '@/theme/tokens';

const GUIDE: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; text: string }[] = [
  { icon: 'scan', title: '1. Escanea tu ticket', text: 'Con el botón central. Leemos el súper, la fecha y cada producto.' },
  { icon: 'create-outline', title: '2. Revisa en segundos', text: 'Quita lo que sobre, añade lo que falte y guarda.' },
  { icon: 'git-compare-outline', title: '3. Compara y ahorra', text: 'Ve dónde es más barato cada producto y qué cesta te sale mejor.' },
];

export default function Home() {
  const { receipts, shoppingList, stores, prices, settings, updateSettings } = useAppStore();
  const months = useMemo(() => monthlySpending(receipts, 6), [receipts]);
  const current = months[months.length - 1].total;
  const previous = months[months.length - 2].total;
  const delta = previous ? ((current - previous) / previous) * 100 : 0;

  const plan = useMemo(
    () =>
      optimizeBasket(shoppingList, activeStores(stores, settings), prices, {
        maxStores: settings.maxStores,
        extraStorePenalty: settings.extraStorePenalty,
        costPerKm: settings.useLocation ? undefined : 0,
      }),
    [shoppingList, stores, prices, settings],
  );

  // Gasto de este mes por súper, para avisar de los límites que el usuario haya fijado.
  const thisMonth = months[months.length - 1].month;
  const storeAlerts = useMemo(() => {
    const spent = spendingByStore(receipts.filter((r) => r.date.startsWith(thisMonth)));
    return stores
      .filter((s) => s.monthlyLimit)
      .map((s) => ({ store: s, spent: spent.find((x) => x.storeId === s.id)?.total ?? 0, limit: s.monthlyLimit! }))
      .filter((a) => a.spent >= a.limit * 0.8);
  }, [receipts, stores, thisMonth]);

  const limit = settings.monthlyLimit;
  const ratio = limit ? current / limit : 0;
  const limitColor = ratio >= 1 ? colors.danger : ratio >= 0.8 ? colors.warning : colors.mint;

  return (
    <Screen
      subtitle="Tu despensa"
      title={settings.userName ? `Hola, ${settings.userName}` : 'Hola 👋'}
      right={
        <Pressable onPress={() => router.push('/ajustes')} hitSlop={10} style={styles.gear} accessibilityLabel="Ajustes">
          <Ionicons name="settings-outline" size={20} color={colors.text} />
        </Pressable>
      }
    >
      {!settings.onboardingDone && (
        <Animated.View entering={FadeInDown.duration(400)} style={{ marginBottom: space.lg }}>
          <GlassCard>
            <Text style={[type.subtitle, { marginBottom: space.md }]}>Así funciona Despensa</Text>
            {GUIDE.map((g, i) => (
              <View key={g.title} style={[styles.row, { marginTop: i ? space.md : 0, alignItems: 'flex-start' }]}>
                <View style={styles.iconWrap}>
                  <Ionicons name={g.icon} size={18} color={colors.mint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>{g.title}</Text>
                  <Text style={type.caption}>{g.text}</Text>
                </View>
              </View>
            ))}
            <View style={[styles.row, { marginTop: space.lg }]}>
              <GlassButton label="Escanear" onPress={() => router.navigate('/escanear')} style={{ flex: 1 }} />
              <GlassButton label="Entendido" variant="ghost" onPress={() => updateSettings({ onboardingDone: true })} />
            </View>
          </GlassCard>
        </Animated.View>
      )}

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
          {limit && (
            <View style={{ marginBottom: space.lg }}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.min(100, ratio * 100)}%`, backgroundColor: limitColor }]} />
              </View>
              <Text style={[type.caption, { marginTop: 6, color: ratio >= 0.8 ? limitColor : colors.textMuted }]}>
                {ratio >= 1
                  ? `Has superado tu límite de ${euro(limit)} en ${euro(current - limit)}`
                  : `${Math.round(ratio * 100)} % de tu límite de ${euro(limit)} · quedan ${euro(limit - current)}`}
              </Text>
            </View>
          )}
          <MonthlyBars data={months} />
        </GlassCard>
      </Animated.View>

      {storeAlerts.map((a) => (
        <GlassCard key={a.store.id} style={{ marginTop: space.md }}>
          <View style={styles.row}>
            <Ionicons name="alert-circle" size={20} color={a.spent >= a.limit ? colors.danger : colors.warning} />
            <Text style={[type.caption, { flex: 1, color: colors.text }]}>
              {a.store.name}: llevas {euro(a.spent)} de tu límite de {euro(a.limit)} este mes
            </Text>
          </View>
        </GlassCard>
      ))}

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
          {receipts.length === 0 && (
            <Text style={[type.caption, { padding: space.lg, textAlign: 'center' }]}>Aún no hay tickets. Escanea el primero con el botón central.</Text>
          )}
        </GlassCard>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: 4 },
  gear: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.glassFillStrong, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
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
