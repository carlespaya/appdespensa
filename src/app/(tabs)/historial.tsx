import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CompareBar, MonthlyBars, monthLabel } from '@/components/Charts';
import { Chip, GlassCard, SectionHeader } from '@/components/Glass';
import { ReceiptRow } from '@/components/ReceiptRow';
import { Screen } from '@/components/Screen';
import { CATEGORY_LABEL } from '@/core/categorize';
import { monthlySpending, spendingByCategory } from '@/core/stats';
import type { Category } from '@/core/types';
import { useAppStore } from '@/store/useAppStore';
import { colors, euro, space, type } from '@/theme/tokens';

const CATEGORY_COLORS = [colors.mint, colors.blue, '#A78BFA', '#F472B6', colors.warning, '#38BDF8', '#94A3B8'];

export default function History() {
  const { receipts, stores } = useAppStore();
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Category | null>(null);

  const filtered = useMemo(
    () =>
      receipts
        .filter((r) => !storeFilter || r.storeId === storeFilter)
        .filter((r) => !categoryFilter || r.lines.some((l) => l.category === categoryFilter)),
    [receipts, storeFilter, categoryFilter],
  );
  const months = useMemo(() => monthlySpending(filtered, 6), [filtered]);
  const categories = useMemo(() => spendingByCategory(filtered), [filtered]);
  const maxCat = categories[0]?.total ?? 1;

  // Agrupa por mes para la lista.
  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const r of filtered) {
      const k = r.date.slice(0, 7);
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <Screen subtitle={`${receipts.length} tickets`} title="Historial">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="Todos" active={!storeFilter} onPress={() => setStoreFilter(null)} />
        {stores.map((s) => (
          <Chip key={s.id} label={s.name} color={s.color} active={storeFilter === s.id} onPress={() => setStoreFilter(storeFilter === s.id ? null : s.id)} />
        ))}
      </ScrollView>

      <GlassCard style={{ marginTop: space.md }}>
        <Text style={type.overline}>Gasto mensual</Text>
        <Text style={[type.title, type.number, { marginBottom: space.lg }]}>
          {euro(months.reduce((a, m) => a + m.total, 0) / months.length)} <Text style={type.caption}>de media</Text>
        </Text>
        <MonthlyBars data={months} />
      </GlassCard>

      <SectionHeader title="Por categoría" action={categoryFilter ? 'Quitar filtro' : undefined} onAction={() => setCategoryFilter(null)} />
      <GlassCard>
        {categories.slice(0, 6).map((c, i) => (
          <Pressable key={c.category} onPress={() => setCategoryFilter(categoryFilter === c.category ? null : c.category)}>
            <CompareBar
              label={CATEGORY_LABEL[c.category]}
              value={c.total}
              max={maxCat}
              color={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
              highlight={categoryFilter === c.category}
            />
          </Pressable>
        ))}
      </GlassCard>

      {groups.map(([month, list]) => (
        <View key={month}>
          <SectionHeader title={`${monthLabel(month)} ${month.slice(0, 4)} · ${euro(list.reduce((a, r) => a + r.total, 0))}`} />
          <GlassCard padded={false}>
            {list.map((r, i) => (
              <ReceiptRow key={r.id} receipt={r} divider={i > 0} />
            ))}
          </GlassCard>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { gap: space.sm },
});
